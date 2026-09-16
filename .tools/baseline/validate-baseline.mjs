import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import ts from 'typescript';

const root = process.cwd();
const docsDir = path.join(root, 'docs', 'system');
const jsonDir = path.join(root, 'system-knowledge');
const errors = [];
const add = (code, detail) => errors.push({ code, detail });
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(jsonDir, name), 'utf8'));
const canonicalSourceExclusions = ['docs/system/**','system-knowledge/**','.tools/baseline/**','**/.stage*'];
const normalizeRepoPath = (value) => value.replaceAll('\\','/');
const sourcePathIsExcluded = (value) => {
  const normalized = normalizeRepoPath(value);
  if (normalized.startsWith('docs/system/') || normalized.startsWith('system-knowledge/') || normalized.startsWith('.tools/baseline/')) return true;
  return normalized.split('/').some(segment => segment.startsWith('.stage'));
};
const aggregateSourceFingerprint = (paths, readBytes) => {
  const normalizedPaths = paths.map(normalizeRepoPath).filter(value => !sourcePathIsExcluded(value)).sort();
  const material = normalizedPaths.map(value => `${value}\0${sha256(readBytes(value))}\n`).join('');
  return {
    fileCount: normalizedPaths.length,
    fingerprint: sha256(Buffer.from(material,'utf8'))
  };
};
const currentFunctionalSource = () => {
  const tracked = childProcess.execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
  const unstaged = new Set(childProcess.execFileSync('git',['diff','--name-only','-z','--'],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').split('\0').filter(Boolean).map(normalizeRepoPath));
  return aggregateSourceFingerprint(tracked, value => {
    if (unstaged.has(value)) {
      const absolute = path.join(root,value);
      return fs.existsSync(absolute) ? fs.readFileSync(absolute) : Buffer.from('WORKTREE_FILE_DELETED','utf8');
    }
    return childProcess.execFileSync('git',['cat-file','blob',`:${value}`],{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});
  });
};
const resolveCommit = (revision) => {
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/i.test(revision)) throw new Error('base_commit must be a full 40-character hexadecimal commit id');
  return childProcess.execFileSync('git',['rev-parse','--verify',`${revision}^{commit}`],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();
};
const committedFunctionalSource = (commit) => {
  const tracked = childProcess.execFileSync('git',['ls-tree','-r','-z','--name-only',commit],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
  return aggregateSourceFingerprint(tracked, value => childProcess.execFileSync('git',['cat-file','blob',`${commit}:${value}`],{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024}));
};
const required = [
  'baseline-manifest.json','baseline-v1.json','index.json','self-reading.json',
  'source-fingerprint.json','changelog.json','baseline-integrity.json','stabilization-history.json'
];
for (const name of required) if (!fs.existsSync(path.join(jsonDir, name))) add('MISSING_CANONICAL_FILE', `system-knowledge/${name}`);
for (const name of ['AI-READ-ME.md','BASELINE-V1.md','CANONICAL-INDEX.md','GOVERNANCE.md','CHANGE-PROTOCOL.md','CHANGELOG.md','KNOWN-LIMITS.md','NEXT-ACTIONS.md','stabilization-history.md']) {
  if (!fs.existsSync(path.join(docsDir, name))) add('MISSING_CANONICAL_FILE', `docs/system/${name}`);
}

const jsonFiles = fs.readdirSync(jsonDir).filter((name) => name.endsWith('.json')).sort();
const catalogs = {};
for (const name of jsonFiles) {
  try {
    const value = readJson(name);
    catalogs[name.replace(/\.json$/, '')] = value;
    if (value.schemaVersion == null) add('MISSING_SCHEMA_VERSION', name);
    if (!value.generatedAt) add('MISSING_GENERATED_AT', name);
    if (Array.isArray(value.records) && Number.isInteger(value.count) && value.count !== value.records.length) add('COUNT_MISMATCH', `${name}: ${value.count} != ${value.records.length}`);
    const groups = [value.records, value.nodes, value.edges, value.tables, value.functions, value.triggers, value.indexes, value.sequences, value.migrations].filter(Array.isArray);
    for (const group of groups) {
      const ids = group.map((record) => typeof record === 'string' ? record : record?.id).filter(Boolean);
      const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      if (duplicates.length) add('DUPLICATE_ID', `${name}: ${duplicates.join(', ')}`);
    }
  } catch (error) {
    add('INVALID_JSON', `${name}: ${error.message}`);
  }
}

const getRecords = (name) => catalogs[name]?.records || [];
const futureTimestampToleranceMs = 5 * 60 * 1000;
const validationNowMs = Date.now();
const checkCurrentTimestamp = (owner, value) => {
  if (typeof value !== 'string') { add('CURRENT_TIMESTAMP_MISSING_OR_INVALID', owner); return; }
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) { add('CURRENT_TIMESTAMP_MISSING_OR_INVALID', `${owner}: ${value}`); return; }
  if (timestampMs > validationNowMs + futureTimestampToleranceMs) add('CURRENT_TIMESTAMP_IN_FUTURE', `${owner}: ${value}`);
};
for (const [name,catalog] of Object.entries(catalogs)) checkCurrentTimestamp(`${name}.generatedAt`, catalog.generatedAt);
checkCurrentTimestamp('baseline-manifest.frozen_at', catalogs['baseline-manifest']?.frozen_at);
checkCurrentTimestamp('baseline-manifest.git_observation_at_generation.observed_at', catalogs['baseline-manifest']?.git_observation_at_generation?.observed_at);
checkCurrentTimestamp('source-fingerprint.freeze_timestamp', catalogs['source-fingerprint']?.freeze_timestamp);
checkCurrentTimestamp('source-fingerprint.git_observation_at_generation.observed_at', catalogs['source-fingerprint']?.git_observation_at_generation?.observed_at);
const currentBaselineVersion = catalogs['baseline-manifest']?.version;
const explicitCurrentBaselinePattern = /(?:current\s+(?:state\s+for\s+)?baseline|current[^.\n]{0,80}\sbaseline)\s+(\d+\.\d+\.\d+)/ig;
for (const [name,catalog] of Object.entries(catalogs)) for (const field of ['method','scope']) {
  const text = catalog?.[field];
  if (typeof text !== 'string') continue;
  for (const match of text.matchAll(explicitCurrentBaselinePattern)) if (match[1] !== currentBaselineVersion) add('CURRENT_BASELINE_METADATA_MISMATCH', `${name}.${field}: ${match[1]} != ${currentBaselineVersion}`);
}
const domains = getRecords('domains');
const modules = getRecords('modules');
const entrypoints = getRecords('entrypoints');
const capabilities = getRecords('capabilities');
const flows = getRecords('flows');
const steps = getRecords('flow-steps');
const transitions = getRecords('state-transitions');
const tables = getRecords('data-model');
const integrations = getRecords('integrations');
const tests = getRecords('tests');
const findings = getRecords('findings');
const objects = catalogs['database-objects'] || { functions: [], triggers: [], migrations: [] };
const sets = {
  domain:new Set(domains.map(x=>x.id)), module:new Set(modules.map(x=>x.id)), entrypoint:new Set(entrypoints.map(x=>x.id)),
  capability:new Set(capabilities.map(x=>x.id)), flow:new Set(flows.map(x=>x.id)), step:new Set(steps.map(x=>x.id)),
  table:new Set(tables.map(x=>x.name)), tableId:new Set(tables.map(x=>x.id)),
  function:new Set((objects.functions||[]).map(x=>x.name)), functionId:new Set((objects.functions||[]).map(x=>x.id)),
  trigger:new Set((objects.triggers||[]).map(x=>x.name)), integration:new Set(integrations.map(x=>x.id)),
  test:new Set(tests.map(x=>x.id)), testName:new Set(tests.map(x=>x.name)), finding:new Set(findings.map(x=>x.id))
};
const checkRefs = (owner, field, values, set) => {
  for (const value of values || []) if (!set.has(value)) add('BROKEN_REFERENCE', `${owner}.${field} -> ${value}`);
};
for (const x of domains) { checkRefs(x.id,'modules',x.modules,sets.module); checkRefs(x.id,'entrypoints',x.entrypoints,sets.entrypoint); checkRefs(x.id,'tables',x.tables,sets.table); checkRefs(x.id,'integrations',x.integrations,sets.integration); }
for (const x of modules) { checkRefs(x.id,'domain',[x.domain],sets.domain); checkRefs(x.id,'tables',x.tables,sets.table); checkRefs(x.id,'integrations',x.integrations,sets.integration); checkRefs(x.id,'tests',(x.tests||[]).filter(v=>v.startsWith('test-')),sets.testName); }
// The module export inventory lists runtime values. Resolve only explicit file paths;
// directory, glob and descriptive paths do not have a safe single-file meaning.
for (const module of modules) {
  const files = typeof module.path === 'string' ? module.path.split(';').map(value => value.trim()) : [];
  if (!files.length || !files.every(value => /\.[jt]sx?$/.test(value) && fs.existsSync(path.join(root,value)) && fs.statSync(path.join(root,value)).isFile())) continue;
  const program = ts.createProgram(files.map(value => path.join(root,value)), { allowJs:true, noResolve:true, skipLibCheck:true });
  const checker = program.getTypeChecker();
  const runtimeExports = new Set();
  for (const file of files) {
    const source = program.getSourceFile(path.join(root,file));
    const symbol = source && checker.getSymbolAtLocation(source);
    if (symbol) for (const exported of checker.getExportsOfModule(symbol)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const typeOnly = exported.declarations?.length && exported.declarations.every(declaration => declaration.isTypeOnly || declaration.parent?.isTypeOnly || declaration.parent?.parent?.isTypeOnly);
      if (!typeOnly && target.flags & ts.SymbolFlags.Value) runtimeExports.add(exported.name);
    }
  }
  for (const claimed of module.exports || []) if (!runtimeExports.has(claimed)) add('MODULE_DECLARED_EXPORT_NOT_FOUND',`${module.id}: ${claimed}`);
}
const dependencyEdges = catalogs.dependencies?.edges || [];
const dependencyCounts = catalogs.dependencies?.counts;
for (const [key,expectedCount] of Object.entries({
  total:dependencyEdges.length,
  direct:dependencyEdges.filter(edge => edge.dependencyType === 'DIRETA').length,
  indirect:dependencyEdges.filter(edge => edge.dependencyType === 'INDIRETA').length,
  external:dependencyEdges.filter(edge => edge.dependencyType === 'EXTERNA').length
})) if (dependencyCounts?.[key] !== expectedCount) add('DEPENDENCY_COUNT_MISMATCH',`${key}: ${dependencyCounts?.[key]} != ${expectedCount}`);
const currentBaselineKey = `baseline_${String(currentBaselineVersion).replaceAll('.','_')}`;
for (const [owner,value] of [
  ['architecture.counts.dependencies',catalogs.architecture?.counts?.dependencies],
  [`repository.${currentBaselineKey}.dependency_count`,catalogs.repository?.[currentBaselineKey]?.dependency_count],
  [`baseline-v1.${currentBaselineKey}.dependency_count`,catalogs['baseline-v1']?.[currentBaselineKey]?.dependency_count],
  [`baseline-manifest.${currentBaselineKey}.dependency_count`,catalogs['baseline-manifest']?.[currentBaselineKey]?.dependency_count]
]) if (Number.isInteger(value) && value !== dependencyEdges.length) add('DEPENDENCY_PROJECTION_COUNT_MISMATCH',`${owner}: ${value} != ${dependencyEdges.length}`);
const callsEdges = new Set(dependencyEdges.filter(edge => edge.relation === 'CALLS' && sets.module.has(edge.source) && sets.module.has(edge.target)).map(edge => `${edge.source}\0${edge.target}`));
for (const module of modules) for (const target of module.calls || []) if (sets.module.has(target) && !callsEdges.has(`${module.id}\0${target}`)) add('MODULE_DEPENDENCY_PROJECTION_MISMATCH',`${module.id} calls ${target} without CALLS edge`);
for (const edge of dependencyEdges) if (edge.relation === 'CALLS' && sets.module.has(edge.source) && sets.module.has(edge.target) && !modules.find(module => module.id === edge.source)?.calls?.includes(edge.target)) add('MODULE_DEPENDENCY_PROJECTION_MISMATCH',`${edge.source} -> ${edge.target} missing in modules.calls`);
for (const x of capabilities) { checkRefs(x.id,'domain',[x.domain],sets.domain); checkRefs(x.id,'entrypoints',x.entrypoints,sets.entrypoint); checkRefs(x.id,'modules',x.modules,sets.module); checkRefs(x.id,'tables',x.database_tables,sets.table); checkRefs(x.id,'functions',x.database_functions,sets.function); checkRefs(x.id,'triggers',x.database_triggers,sets.trigger); checkRefs(x.id,'integrations',x.integrations,sets.integration); checkRefs(x.id,'tests',(x.tests||[]).filter(v=>v.startsWith('test-')),sets.test); }
for (const x of flows) { checkRefs(x.id,'domains',x.domains,sets.domain); checkRefs(x.id,'modules',x.modules,sets.module); checkRefs(x.id,'entrypoints',x.entrypoints,sets.entrypoint); checkRefs(x.id,'capabilities',x.capabilities,sets.capability); checkRefs(x.id,'tables',x.tables,sets.table); checkRefs(x.id,'functions',x.database_functions,sets.function); checkRefs(x.id,'triggers',x.database_triggers,sets.trigger); checkRefs(x.id,'integrations',x.integrations,sets.integration); checkRefs(x.id,'tests',(x.tests||[]).filter(v=>v.startsWith('test-')),sets.test); }
for (const x of steps) { checkRefs(x.id,'flow',[x.flow],sets.flow); checkRefs(x.id,'capability',[x.capability],sets.capability); checkRefs(x.id,'entrypoint',x.entrypoint?[x.entrypoint]:[],sets.entrypoint); checkRefs(x.id,'module',x.module?[x.module]:[],sets.module); checkRefs(x.id,'next',(x.possible_next_steps||[]).filter(v=>v.includes('.step_')),sets.step); }
for (const x of transitions) { checkRefs(x.id,'flow',[x.flow],sets.flow); checkRefs(x.id,'capability',[x.capability],sets.capability); }
for (const x of getRecords('capability-relations')) { checkRefs(x.id,'from',[x.from],sets.capability); checkRefs(x.id,'to',[x.to],sets.capability); }
for (const x of getRecords('flow-relations')) { checkRefs(x.id,'from',[x.from],sets.flow); checkRefs(x.id,'to',[x.to],sets.flow); }
for (const x of getRecords('finding-relations')) { checkRefs(`${x.from}->${x.to}`,'from',[x.from],sets.finding); checkRefs(`${x.from}->${x.to}`,'to',[x.to],sets.finding); }

const baselineCounts = catalogs['baseline-v1'] || {};
const expected = {
  domains:baselineCounts.domains, modules:baselineCounts.modules, entrypoints:baselineCounts.entrypoints,
  capabilities:baselineCounts.capabilities, flows:baselineCounts.flows, 'flow-steps':baselineCounts.flow_steps,
  'state-transitions':baselineCounts.state_transitions, 'data-model':baselineCounts.tables,
  'database-relations':baselineCounts.data_relations, integrations:baselineCounts.integrations,
  webhooks:baselineCounts.webhooks, cron:baselineCounts.crons, environment:baselineCounts.environment_variables,
  tests:baselineCounts.tests, findings:baselineCounts.findings
};
for (const [name, count] of Object.entries(expected)) if (getRecords(name).length !== count) add('CANONICAL_COUNT_MISMATCH', `${name}: expected ${count}, got ${getRecords(name).length}`);
if ((objects.migrations||[]).length !== baselineCounts.migrations) add('CANONICAL_COUNT_MISMATCH','migrations');
if ((objects.functions||[]).length !== baselineCounts.sql_functions) add('CANONICAL_COUNT_MISMATCH','sql functions');
if ((objects.triggers||[]).length !== baselineCounts.triggers) add('CANONICAL_COUNT_MISMATCH','triggers');
if (Number.isInteger(baselineCounts.sequences) && (objects.sequences||[]).length !== baselineCounts.sequences) add('CANONICAL_COUNT_MISMATCH','sequences');
const joinHumanList = (values) => values.length < 2 ? (values[0] || '') : `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`;
const priorityVocabulary = [...new Set(findings.map(finding => finding.priority).filter(Boolean))]
  .sort((left,right) => String(left).localeCompare(String(right),undefined,{numeric:true}));
const priorityProjection = joinHumanList(priorityVocabulary.map(priority => `${priority} ${findings.filter(finding => finding.priority===priority).length}`));
const runtimeRecords = getRecords('runtime-validation');
const runtimeStatusProjection = ['PASS','PARTIAL','FAIL']
  .map(status => `${runtimeRecords.filter(record => record.status===status).length} ${status}`)
  .join(', ').replace(/, ([^,]+)$/, ' e $1');
const canonicalScorecardJustifications = {
  DATA: `${(objects.tables||[]).length} tabelas locais e remotas coincidem por nome no OpenAPI read-only; ${(objects.migrations||[]).length} migrations e definições finais locais foram recontadas.`,
  RISKS: `${findings.length} findings foram contabilizados integralmente: ${priorityProjection}; as somas por type, severity, priority e status fecham em ${findings.length}, sem record ausente.`,
  RUNTIME: `${runtimeRecords.length} checks foram revisados; a distribuição canônica atual é ${runtimeStatusProjection}.`
};
const completenessRecords = new Map(getRecords('completeness').map(record => [record.area,record]));
const scorecardText = fs.readFileSync(path.join(docsDir,'completeness-scorecard.md'),'utf8');
const scorecardRows = new Map(scorecardText.split(/\r?\n/).filter(line => /^\| (DATA|RISKS|RUNTIME) \|/.test(line)).map(line => {
  const cells = line.split('|').map(cell => cell.trim());
  return [cells[1],cells[3]];
}));
for (const [area,expectedJustification] of Object.entries(canonicalScorecardJustifications)) {
  if (completenessRecords.get(area)?.justification !== expectedJustification) add('COMPLETENESS_CANONICAL_COUNT_MISMATCH',`completeness.json:${area}`);
  if (scorecardRows.get(area) !== expectedJustification) add('COMPLETENESS_SCORECARD_PROJECTION_MISMATCH',`completeness-scorecard.md:${area}`);
}
const runtimeManifest = catalogs['baseline-manifest'];
const runtimeGitRecord = runtimeRecords.find(record => record.id==='runtime.git-production');
const volatileGitHeadPattern = /(?:\bHEAD\b|origin\/[A-Za-z0-9._/-]+|live branch tip)[^\r\n]{0,160}\b[0-9a-f]{40}\b/i;
for (const record of runtimeRecords) {
  if (record.temporal_semantics!=='HISTORICAL_SNAPSHOT' && volatileGitHeadPattern.test(`${record.target || ''} ${record.result || ''}`)) add('VOLATILE_GIT_HEAD_EMBEDDED_AS_CURRENT',record.id);
}
if (!runtimeGitRecord) add('RUNTIME_GIT_POLICY_RECORD_MISSING','runtime.git-production');
else {
  if (runtimeGitRecord.temporal_semantics!=='CURRENT_CANONICAL_SEMANTICS') add('RUNTIME_GIT_TEMPORAL_SEMANTICS_INVALID',runtimeGitRecord.id);
  if (runtimeGitRecord.canonical_functional_source!==runtimeManifest?.source_state?.base_commit) add('RUNTIME_GIT_CANONICAL_SOURCE_MISMATCH',runtimeGitRecord.id);
  if (runtimeGitRecord.baseline_commit!==runtimeManifest?.source_state?.baseline_commit || runtimeGitRecord.baseline_commit!=='SELF_NOT_RECORDED') add('RUNTIME_GIT_BASELINE_COMMIT_POLICY_INVALID',runtimeGitRecord.id);
  if (runtimeGitRecord.live_branch_tip!=='VOLATILE_NOT_EMBEDDED_IN_FROZEN_BASELINE') add('RUNTIME_GIT_LIVE_TIP_POLICY_INVALID',runtimeGitRecord.id);
  if (runtimeGitRecord.historical_snapshot?.classification!=='HISTORICAL_SNAPSHOT') add('RUNTIME_GIT_HISTORICAL_SNAPSHOT_INVALID',runtimeGitRecord.id);
}
const runtimeMarkdown = fs.readFileSync(path.join(docsDir,'runtime-validation.md'),'utf8');
const runtimeTableStart = '<!-- RUNTIME_CURRENT_TABLE_START -->';
const runtimeTableEnd = '<!-- RUNTIME_CURRENT_TABLE_END -->';
const runtimeMarkdownCell = (value) => String(value ?? '').replaceAll('|','\\|').replaceAll(/\r?\n/g,' ');
const expectedRuntimeTable = [
  '| ID | Target | Evidence | Status | Result |',
  '| --- | --- | --- | --- | --- |',
  ...runtimeRecords.map(record => `| \`${runtimeMarkdownCell(record.id)}\` | ${runtimeMarkdownCell(record.target || record.kind)} | ${runtimeMarkdownCell(record.evidence_source || record.kind)} | ${runtimeMarkdownCell(record.status)} | ${runtimeMarkdownCell(record.result)} |`)
].join('\n');
const runtimeTableStartIndex = runtimeMarkdown.indexOf(runtimeTableStart);
const runtimeTableEndIndex = runtimeMarkdown.indexOf(runtimeTableEnd);
if (runtimeTableStartIndex<0 || runtimeTableEndIndex<=runtimeTableStartIndex) add('RUNTIME_CURRENT_TABLE_MARKERS_INVALID','docs/system/runtime-validation.md');
else {
  const actualRuntimeTable = runtimeMarkdown.slice(runtimeTableStartIndex+runtimeTableStart.length,runtimeTableEndIndex).trim();
  if (actualRuntimeTable!==expectedRuntimeTable) add('RUNTIME_MACHINE_HUMAN_MISMATCH','docs/system/runtime-validation.md');
}
const expectedRuntimeSummary = `Current catalog: **${runtimeRecords.length} checks — ${runtimeRecords.filter(record=>record.status==='PASS').length} PASS, ${runtimeRecords.filter(record=>record.status==='PARTIAL').length} PARTIAL, ${runtimeRecords.filter(record=>record.status==='FAIL').length} FAIL.**`;
if (!runtimeMarkdown.includes(expectedRuntimeSummary)) add('RUNTIME_MACHINE_HUMAN_SUMMARY_MISMATCH','docs/system/runtime-validation.md');
if ((catalogs.capabilities?.metrics?.by_status?.DESCONHECIDA || 0) !== 0) add('UNCLASSIFIED_CAPABILITY','capabilities.metrics.by_status.DESCONHECIDA');
if ((catalogs.flows?.metrics?.capabilities_unclassified || 0) !== 0) add('UNCLASSIFIED_CAPABILITY','flows.metrics.capabilities_unclassified');
if ((catalogs.flows?.metrics?.functional_entrypoints_unclassified || 0) !== 0) add('UNCLASSIFIED_ENTRYPOINT','flows.metrics.functional_entrypoints_unclassified');
if (flows.some(flow=>!flow.status)) add('FLOW_WITHOUT_STATUS','flows.json');
if ((catalogs.contradictions?.pending ?? -1) !== 0) add('PENDING_CONTRADICTION','contradictions.json');
if ((catalogs['unresolved-evidence']?.count ?? -1) !== getRecords('unresolved-evidence').length) add('UNRESOLVED_EVIDENCE_DRIFT','unresolved-evidence.json');

const baselineFiles = [docsDir,jsonDir].flatMap(dir=>fs.readdirSync(dir).filter(name=>fs.statSync(path.join(dir,name)).isFile()).map(name=>path.join(dir,name)));
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,/\b(?:ghp|github_pat|sk_live|sk_test|sk-proj)-?[A-Za-z0-9_-]{16,}\b/,/\b(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/i,/(?:api[_-]?key|password|token|secret)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i];
const mojibake = /Ã(?:ƒ|§|£|©|¡|³|ª|º|µ|¢)|â(?:€|†)|ï¿½/;
for (const file of baselineFiles) {
  const bytes=fs.readFileSync(file), text=bytes.toString('utf8'), rel=path.relative(root,file).replaceAll('\\','/');
  if (bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf) add('BOM',rel);
  if (text.includes('\uFFFD')) add('REPLACEMENT_CHARACTER',rel);
  if (mojibake.test(text)) add('DOCUMENT_MOJIBAKE',rel);
  if (secretPatterns.some(pattern=>pattern.test(text))) add('SECRET_PATTERN',rel);
}

const index = catalogs.index;
if (index) {
  const indexed = new Set(index.records.map(record=>record.path));
  for (const name of jsonFiles) if (!indexed.has(`system-knowledge/${name}`)) add('UNINDEXED_JSON',name);
  for (const record of index.records) if (!fs.existsSync(path.join(root,record.path))) add('INDEX_PATH_MISSING',record.path);
}

const integrity = catalogs['baseline-integrity'];
if (integrity) {
  if (!integrity.exclusions?.some(item=>item.path==='system-knowledge/baseline-integrity.json')) add('INTEGRITY_SELF_EXCLUSION_MISSING','baseline-integrity.json');
  const listFilesRecursively = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    const absolute=path.join(dir,entry.name);
    return entry.isDirectory() ? listFilesRecursively(absolute) : [absolute];
  });
  const expectedIntegrityPaths = [
    ...listFilesRecursively(docsDir).map(file=>path.relative(root,file).replaceAll('\\','/')),
    ...jsonFiles.filter(name=>name!=='baseline-integrity.json').map(name=>`system-knowledge/${name}`),
    '.tools/baseline/validate-baseline.mjs'
  ].sort();
  const recordedIntegrityPaths = (integrity.records||[]).map(record=>record.path);
  const recordedIntegrityPathSet = new Set(recordedIntegrityPaths);
  const duplicateIntegrityPaths = [...new Set(recordedIntegrityPaths.filter((value,index)=>recordedIntegrityPaths.indexOf(value)!==index))];
  for (const value of duplicateIntegrityPaths) add('INTEGRITY_DUPLICATE_PATH',value);
  for (const value of expectedIntegrityPaths) if (!recordedIntegrityPathSet.has(value)) add('INTEGRITY_EXPECTED_PATH_MISSING',value);
  const expectedIntegrityPathSet = new Set(expectedIntegrityPaths);
  for (const value of recordedIntegrityPaths) if (!expectedIntegrityPathSet.has(value)) add('INTEGRITY_UNEXPECTED_PATH',value);
  for (const record of integrity.records || []) {
    const absolute=path.join(root,record.path);
    if (!fs.existsSync(absolute)) { add('INTEGRITY_PATH_MISSING',record.path); continue; }
    const bytes=fs.readFileSync(absolute);
    if (bytes.length!==record.size) add('INTEGRITY_SIZE_MISMATCH',record.path);
    if (sha256(bytes)!==record.sha256) add('INTEGRITY_HASH_MISMATCH',record.path);
  }
  const material=[...(integrity.records||[])].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(record=>`${record.path}\0${record.sha256}\n`).join('');
  if (sha256(Buffer.from(material,'utf8'))!==integrity.aggregate_hash) add('INTEGRITY_AGGREGATE_MISMATCH','baseline-integrity.json');
}

const fingerprint = catalogs['source-fingerprint'];
let currentSource;
if (fingerprint) {
  for (const key of ['base_commit','package_lock_sha256','migrations_aggregate_hash','source_tree_fingerprint','freeze_timestamp']) if (!fingerprint[key]) add('SOURCE_FINGERPRINT_FIELD_MISSING',key);
  if (JSON.stringify(fingerprint.source_tree_exclusions)!==JSON.stringify(canonicalSourceExclusions)) add('SOURCE_FINGERPRINT_EXCLUSIONS_INVALID','Canonical baseline and .stage exclusions are required.');
  currentSource = currentFunctionalSource();
  if(fingerprint.source_tree_file_count!==currentSource.fileCount) add('SOURCE_FINGERPRINT_FILE_COUNT_MISMATCH',`${fingerprint.source_tree_file_count} != ${currentSource.fileCount}`);
  if(fingerprint.source_tree_fingerprint!==currentSource.fingerprint) add('SOURCE_TREE_FINGERPRINT_MISMATCH','source-fingerprint.json');
}
const manifest = catalogs['baseline-manifest'];
if (manifest?.baseline_id!=='rota5-baseline-v1'||!/^\d+\.\d+\.\d+$/.test(manifest?.version||'')||manifest?.status!=='FROZEN') add('MANIFEST_IDENTITY_INVALID','baseline-manifest.json');
if (!manifest?.source_state?.base_commit || manifest.source_state.source_tree_fingerprint!==fingerprint?.source_tree_fingerprint || manifest.source_state.baseline_commit!=='SELF_NOT_RECORDED') add('MANIFEST_SOURCE_STATE_INVALID','baseline-manifest.json');
if (catalogs['baseline-v1']?.version !== manifest?.version) add('BASELINE_VERSION_MISMATCH',`${catalogs['baseline-v1']?.version} != ${manifest?.version}`);
const currentFreezeTimestamp = manifest?.frozen_at;
if (manifest?.generatedAt !== currentFreezeTimestamp) add('CURRENT_FREEZE_TIMESTAMP_MISMATCH','baseline-manifest.generatedAt != baseline-manifest.frozen_at');
for (const [name,catalog] of Object.entries(catalogs)) if (catalog?.generatedAt !== currentFreezeTimestamp) add('CURRENT_GENERATION_TIMESTAMP_MISMATCH',`${name}.generatedAt != baseline-manifest.frozen_at`);
if (fingerprint?.freeze_timestamp !== currentFreezeTimestamp) add('CURRENT_FREEZE_TIMESTAMP_MISMATCH','source-fingerprint.freeze_timestamp != baseline-manifest.frozen_at');
if (manifest?.git_observation_at_generation?.observed_at !== currentFreezeTimestamp) add('CURRENT_FREEZE_TIMESTAMP_MISMATCH','baseline-manifest.git_observation_at_generation.observed_at != baseline-manifest.frozen_at');
if (fingerprint?.git_observation_at_generation?.observed_at !== currentFreezeTimestamp) add('CURRENT_FREEZE_TIMESTAMP_MISMATCH','source-fingerprint.git_observation_at_generation.observed_at != baseline-manifest.frozen_at');
const taxonomy = catalogs.findings?.finding_status_taxonomy;
const taxonomyProperties = ['confirmed','operational_open','active_metric','potential_metric','release_blocking','stabilization_queue','validation_queue','closed'];
const taxonomyStatuses = taxonomy?.statuses;
const canonicalFindingStatuses = taxonomy?.canonical_statuses;
const exactStatusSet = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length===right.length && left.every(value=>right.includes(value));
if (!Array.isArray(canonicalFindingStatuses) || new Set(canonicalFindingStatuses).size!==canonicalFindingStatuses.length || !taxonomyStatuses || typeof taxonomyStatuses!=='object') add('FINDING_TAXONOMY_SCHEMA_INVALID','findings.json');
if (!exactStatusSet(canonicalFindingStatuses,Object.keys(taxonomyStatuses||{}))) add('FINDING_TAXONOMY_STATUS_SET_MISMATCH','findings.json');
if (!exactStatusSet(taxonomy?.future_lifecycle_statuses,manifest?.governance?.finding_lifecycle)) add('FINDING_TAXONOMY_GOVERNANCE_LIFECYCLE_MISMATCH','baseline-manifest.json');
const governanceText = fs.readFileSync(path.join(docsDir,'GOVERNANCE.md'),'utf8');
if (!governanceText.includes('system-knowledge/findings.json') || !governanceText.includes('machine-readable')) add('GOVERNANCE_TAXONOMY_REFERENCE_MISSING','docs/system/GOVERNANCE.md');
for (const status of canonicalFindingStatuses || []) {
  const semantics = taxonomyStatuses?.[status];
  if (!semantics || taxonomyProperties.some(key=>typeof semantics[key]!=='boolean')) { add('FINDING_TAXONOMY_STATUS_SCHEMA_INVALID',status); continue; }
  if ((semantics.active_metric || semantics.potential_metric || semantics.release_blocking) && !semantics.operational_open) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: metric or gate requires operational_open`);
  if ((semantics.active_metric || semantics.release_blocking) && !semantics.confirmed) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: active metric or gate requires confirmed`);
  if (semantics.potential_metric && semantics.confirmed) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: potential metric must be unconfirmed`);
  if (semantics.active_metric && semantics.potential_metric) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: cannot be both active and potential`);
  if (semantics.operational_open!==semantics.stabilization_queue) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: operational_open and stabilization_queue must match`);
  if (semantics.closed && (semantics.operational_open || semantics.release_blocking || semantics.stabilization_queue || semantics.validation_queue)) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: closed status cannot remain queued or open`);
  if (semantics.validation_queue && (semantics.confirmed || semantics.operational_open || semantics.release_blocking || semantics.stabilization_queue)) add('FINDING_TAXONOMY_SEMANTIC_INVALID',`${status}: validation queue must be unconfirmed and non-operational`);
}
const hasTaxonomyFlag = (finding, flag) => Boolean(taxonomyStatuses?.[finding.status]?.[flag]);
const isActiveFinding = (finding) => hasTaxonomyFlag(finding,'active_metric');
const isPotentialFinding = (finding) => hasTaxonomyFlag(finding,'potential_metric');
const isOpenFinding = (finding) => hasTaxonomyFlag(finding,'operational_open');
const isResolvedFinding = (finding) => hasTaxonomyFlag(finding,'closed') && finding.status==='RESOLVED';
const blocksRelease = (finding) => hasTaxonomyFlag(finding,'release_blocking');
const nextActionsText = fs.readFileSync(path.join(docsDir,'NEXT-ACTIONS.md'),'utf8');
const nextActionsOperationalStatuses = new Set(['ACTIVE','POTENTIAL','NOT_VALIDATED']);
let nextActionsSection = null;
for (const line of nextActionsText.split(/\r?\n/)) {
  const sectionMatch = line.match(/^##\s+(P[0-4])\b/i) || line.match(/^##\s+(RESOLVED(?:\s+STABILIZATION\s+ITEMS)?|LATER)\b/i);
  if (sectionMatch) nextActionsSection = sectionMatch[1].toUpperCase();
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const finding = findings.find(item => item.id===match[1]);
    if (!finding || !nextActionsSection) continue;
    const operational = nextActionsOperationalStatuses.has(finding.status);
    const prioritySection = /^P[0-4]$/.test(nextActionsSection);
    const resolvedSection = nextActionsSection.startsWith('RESOLVED');
    if (operational && prioritySection && finding.priority!==nextActionsSection) add('NEXT_ACTIONS_PRIORITY_MISMATCH',`${finding.id}: ${nextActionsSection} != ${finding.priority}`);
    if (operational && nextActionsSection==='LATER' && !['P3','P4'].includes(finding.priority)) add('NEXT_ACTIONS_PRIORITY_MISMATCH',`${finding.id}: LATER incompatible with ${finding.priority}`);
    if (operational && resolvedSection) add('NEXT_ACTIONS_LIFECYCLE_SECTION_MISMATCH',`${finding.id}: ${finding.status} under ${nextActionsSection}`);
    if (finding.status==='RESOLVED' && (prioritySection || nextActionsSection==='LATER')) add('NEXT_ACTIONS_LIFECYCLE_SECTION_MISMATCH',`${finding.id}: RESOLVED under ${nextActionsSection}`);
  }
}
for (const finding of findings) if (!canonicalFindingStatuses?.includes(finding.status)) add('FINDING_STATUS_INVALID',`${finding.id}: ${finding.status}`);
const isReleaseGateApplicable = (finding) => ['P0','P1'].includes(finding.priority) || ['CRITICAL','HIGH'].includes(finding.severity);
const derivedGroups = {
  active_p0: findings.filter(finding => isActiveFinding(finding) && finding.priority==='P0'),
  active_high: findings.filter(finding => isActiveFinding(finding) && finding.severity==='HIGH'),
  potential_high: findings.filter(finding => isPotentialFinding(finding) && finding.severity==='HIGH'),
  open_high: findings.filter(finding => isOpenFinding(finding) && finding.severity==='HIGH'),
  resolved: findings.filter(isResolvedFinding),
  active_p0_p1: findings.filter(finding => isActiveFinding(finding) && ['P0','P1'].includes(finding.priority)),
  potential_p0_p1: findings.filter(finding => isPotentialFinding(finding) && ['P0','P1'].includes(finding.priority)),
  open_p0_p1: findings.filter(finding => isOpenFinding(finding) && ['P0','P1'].includes(finding.priority)),
  release_blocking: findings.filter(finding => blocksRelease(finding) && isReleaseGateApplicable(finding))
};
const derivedFindingIds = (name) => derivedGroups[name].map(finding => finding.id);
const sameIds = (actual, expected) => Array.isArray(actual) && actual.length===expected.length && actual.every((id,index) => id===expected[index]);
const checkDerivedCount = (owner, actual, name) => {
  if (actual !== derivedGroups[name].length) add('DERIVED_FINDING_COUNT_MISMATCH',`${owner}: ${actual} != ${derivedGroups[name].length}`);
};
const checkDerivedIds = (owner, actual, name) => {
  if (!sameIds(actual, derivedFindingIds(name))) add('DERIVED_FINDING_LIST_MISMATCH',owner);
};
if (!catalogs.findings?.finding_status_taxonomy) add('FINDING_STATUS_TAXONOMY_MISSING','findings.json');
if (manifest?.product_health) {
  checkDerivedCount('baseline-manifest.product_health.active_p0',manifest.product_health.active_p0,'active_p0');
  checkDerivedCount('baseline-manifest.product_health.active_high',manifest.product_health.active_high,'active_high');
  checkDerivedCount('baseline-manifest.product_health.potential_high',manifest.product_health.potential_high,'potential_high');
  checkDerivedCount('baseline-manifest.product_health.open_high',manifest.product_health.open_high,'open_high');
  checkDerivedCount('baseline-manifest.product_health.resolved',manifest.product_health.resolved,'resolved');
  checkDerivedIds('baseline-manifest.active_high_findings',manifest.active_high_findings,'active_high');
  checkDerivedIds('baseline-manifest.potential_high_findings',manifest.potential_high_findings,'potential_high');
  checkDerivedIds('baseline-manifest.open_high_findings',manifest.open_high_findings,'open_high');
  checkDerivedIds('baseline-manifest.high_findings',manifest.high_findings,'open_high');
}
const riskSummary = catalogs['risk-summary'];
if (riskSummary) {
  checkDerivedIds('risk-summary.active_high_critical',riskSummary.active_high_critical,'active_high');
  checkDerivedIds('risk-summary.potential_high_critical',riskSummary.potential_high_critical,'potential_high');
  checkDerivedIds('risk-summary.open_high_critical',riskSummary.open_high_critical,'open_high');
  checkDerivedIds('risk-summary.active_p0_p1',riskSummary.active_p0_p1,'active_p0_p1');
  checkDerivedIds('risk-summary.potential_p0_p1',riskSummary.potential_p0_p1,'potential_p0_p1');
  checkDerivedIds('risk-summary.open_p0_p1',riskSummary.open_p0_p1,'open_p0_p1');
}
const statusGroupCount = (status) => findings.filter(finding => finding.status===status).length;
if (riskSummary?.by_status) for (const status of canonicalFindingStatuses) {
  if (riskSummary.by_status[status] !== statusGroupCount(status)) add('DERIVED_FINDING_STATUS_COUNT_MISMATCH',`risk-summary.by_status.${status}`);
}
const findingAggregationFields = [
  ['type','by_type'],
  ['severity','by_severity'],
  ['priority','by_priority'],
  ['status','by_status']
];
const findingFieldIsPresent = (value) => value !== undefined && value !== null && value !== '';
for (const finding of findings) for (const [field] of findingAggregationFields) {
  if (!findingFieldIsPresent(finding[field])) add('FINDING_AGGREGATION_FIELD_MISSING',`${finding.id}.${field}`);
}
const checkCompleteAggregation = (owner, aggregation, field, records) => {
  if (!aggregation || typeof aggregation !== 'object' || Array.isArray(aggregation)) {
    add('FINDING_AGGREGATION_MISSING',owner);
    return;
  }
  const vocabulary = [...new Set(records.map(record => record[field]).filter(findingFieldIsPresent))]
    .sort((left,right) => String(left).localeCompare(String(right),undefined,{numeric:true}));
  for (const value of vocabulary) {
    const expectedCount = records.filter(record => record[field]===value).length;
    if (aggregation[value] !== expectedCount) add('FINDING_AGGREGATION_VALUE_MISMATCH',`${owner}.${value}: ${aggregation[value]} != ${expectedCount}`);
  }
  const sum = Object.values(aggregation).reduce((total,value) => total + (Number.isFinite(value) ? value : 0),0);
  if (sum !== records.length) add('FINDING_AGGREGATION_SUM_MISMATCH',`${owner}: ${sum} != ${records.length}`);
};
if (riskSummary?.total !== findings.length) add('FINDINGS_TOTAL_MISMATCH',`risk-summary.total: ${riskSummary?.total} != ${findings.length}`);
for (const [field,aggregation] of findingAggregationFields) checkCompleteAggregation(`risk-summary.${aggregation}`,riskSummary?.[aggregation],field,findings);
checkCompleteAggregation('baseline-v1.findings_by_severity',catalogs['baseline-v1']?.findings_by_severity,'severity',findings);
checkCompleteAggregation('baseline-v1.findings_by_priority',catalogs['baseline-v1']?.findings_by_priority,'priority',findings);
if (manifest?.product_health?.findings !== findings.length) add('FINDINGS_TOTAL_MISMATCH',`baseline-manifest.product_health.findings: ${manifest?.product_health?.findings} != ${findings.length}`);
const currentOperationalFindings = findings.filter(finding => hasTaxonomyFlag(finding,'operational_open'));
checkCompleteAggregation('health.system.finding_counts_by_severity',catalogs.health?.system?.finding_counts_by_severity,'severity',currentOperationalFindings);
if (!sameIds(catalogs.health?.system?.current_findings,currentOperationalFindings.map(finding=>finding.id))) add('DERIVED_FINDING_LIST_MISMATCH','health.system.current_findings');
const expectedAggregationInvariants = {
  FINDINGS_TOTAL_MATCH:'SIM',
  BY_TYPE_SUM_MATCH:'SIM',
  BY_SEVERITY_SUM_MATCH:'SIM',
  BY_PRIORITY_SUM_MATCH:'SIM',
  BY_STATUS_SUM_MATCH:'SIM',
  UNKNOWN_OR_UNCOUNTED_FINDINGS:0,
  RELEASE_BLOCKER_COUNT:derivedGroups.release_blocking.length
};
for (const owner of [riskSummary?.aggregation_invariants,catalogs['cross-audit']?.aggregation_invariants]) {
  for (const [key,value] of Object.entries(expectedAggregationInvariants)) if (owner?.[key] !== value) add('AGGREGATION_INVARIANT_MISMATCH',`${key}: ${owner?.[key]} != ${value}`);
}
if (catalogs['cross-audit']?.semantic_consistency?.status !== 'PASS') add('SEMANTIC_AUDIT_NOT_PASS','cross-audit.semantic_consistency.status');
const resolvedTopLevelFields = ['title','description','evidence','impact','workaround','direction','priority_justification'];
const resolvedFindings = findings.filter(isResolvedFinding);
let resolvedCurrentStateComplete = 0;
let resolvedWithoutCurrentState = 0;
let resolvedWithActiveTopLevelClaims = 0;
let resolvedWithNoncurrentTopLevelEvidence = 0;
let resolvedReleaseBlockingTrue = 0;
let resolvedOperationalOpenTrue = 0;
let historicalEvidencePreserved = true;
for (const finding of resolvedFindings) {
  const state = finding.current_state;
  const stateComplete = state && state.lifecycle==='RESOLVED' && state.operational_open===false && state.release_blocking===false &&
    state.workaround_required===false && findingFieldIsPresent(state.current_impact);
  if (stateComplete) resolvedCurrentStateComplete += 1;
  else {
    if (!state) resolvedWithoutCurrentState += 1;
    add('RESOLVED_CURRENT_STATE_INCOMPLETE',finding.id);
  }
  if (state?.release_blocking===true) resolvedReleaseBlockingTrue += 1;
  if (state?.operational_open===true) resolvedOperationalOpenTrue += 1;
  const historical = finding.resolution?.historical_evidence;
  const hasHistoricalSnapshot = historical && typeof historical==='object' && !Array.isArray(historical) &&
    resolvedTopLevelFields.every(field => Object.hasOwn(historical,field));
  if (!hasHistoricalSnapshot) {
    historicalEvidencePreserved = false;
    add('RESOLVED_HISTORICAL_EVIDENCE_MISSING',finding.id);
  }
  const topEvidenceCurrent = Array.isArray(finding.evidence) && finding.evidence.length>0 &&
    finding.evidence.every(entry => entry && entry.evidence_state==='CURRENT');
  if (!topEvidenceCurrent) {
    resolvedWithNoncurrentTopLevelEvidence += 1;
    add('RESOLVED_TOP_LEVEL_EVIDENCE_NOT_CURRENT',finding.id);
  }
  const repeatsHistoricalClaim = hasHistoricalSnapshot && ['title','description','impact','workaround','direction','priority_justification']
    .some(field => JSON.stringify(finding[field])===JSON.stringify(historical[field]));
  const currentOnlyContract = state?.top_level_claims==='CURRENT_RESOLUTION_ONLY' &&
    ['title','description','impact','workaround','direction','priority_justification'].every(field => findingFieldIsPresent(finding[field]));
  if (!currentOnlyContract || repeatsHistoricalClaim) {
    resolvedWithActiveTopLevelClaims += 1;
    add('RESOLVED_ACTIVE_TOP_LEVEL_CLAIM',finding.id);
  }
}
const expectedResolvedSemanticInvariants = {
  RESOLVED_FINDINGS_TOTAL:resolvedFindings.length,
  RESOLVED_CURRENT_STATE_COMPLETE:resolvedCurrentStateComplete,
  RESOLVED_WITHOUT_CURRENT_STATE:resolvedWithoutCurrentState,
  RESOLVED_WITH_ACTIVE_TOP_LEVEL_CLAIMS:resolvedWithActiveTopLevelClaims,
  RESOLVED_WITH_NONCURRENT_TOP_LEVEL_EVIDENCE:resolvedWithNoncurrentTopLevelEvidence,
  RESOLVED_RELEASE_BLOCKING_TRUE:resolvedReleaseBlockingTrue,
  RESOLVED_OPERATIONAL_OPEN_TRUE:resolvedOperationalOpenTrue,
  HISTORICAL_EVIDENCE_PRESERVED:historicalEvidencePreserved?'SIM':'NAO'
};
for (const owner of [
  catalogs.findings?.resolved_semantic_contract?.invariants,
  riskSummary?.resolved_semantic_invariants,
  catalogs['cross-audit']?.resolved_semantic_invariants
]) {
  for (const [key,value] of Object.entries(expectedResolvedSemanticInvariants)) if (owner?.[key] !== value) add('RESOLVED_SEMANTIC_INVARIANT_MISMATCH',`${key}: ${owner?.[key]} != ${value}`);
}
const canonicalQualityGate = catalogs['baseline-v1']?.quality_gate;
const canonicalDefaultSuite = canonicalQualityGate?.default_node_suite?.match(/\b\d+\/\d+\b/)?.[0];
const canonicalQualityGateRun = canonicalQualityGate?.quality_gate_run;
if (!canonicalDefaultSuite || !Number.isInteger(canonicalQualityGateRun)) add('CURRENT_EVIDENCE_CANONICAL_GATE_MISSING','baseline-v1.quality_gate');
const productGateSuite = catalogs['baseline-v1']?.product_gate_status?.npm_test;
if (!productGateSuite || !Number.isInteger(productGateSuite.cases) || !Number.isInteger(productGateSuite.passed)) {
  add('PRODUCT_GATE_DEFAULT_SUITE_INVALID','baseline-v1.product_gate_status.npm_test');
} else if (`${productGateSuite.passed}/${productGateSuite.cases}` !== canonicalDefaultSuite) {
  add('PRODUCT_GATE_DEFAULT_SUITE_MISMATCH',`${productGateSuite.passed}/${productGateSuite.cases} != ${canonicalDefaultSuite}`);
}
const unresolvedRecords = getRecords('unresolved-evidence');
const unresolvedById = new Map(unresolvedRecords.map(record => [record.id,record]));
for (const id of catalogs['baseline-v1']?.unresolved_evidence || []) {
  const record = unresolvedById.get(id);
  if (!record) add('BASELINE_UNRESOLVED_REFERENCE_UNKNOWN',id);
  else if (record.status !== 'NOT_VALIDATED') add('BASELINE_UNRESOLVED_REFERENCE_NOT_CURRENT',`${id}: ${record.status}`);
}
const sameIdSet = (actual, expected) => Array.isArray(actual) && actual.length===expected.length && new Set(actual).size===actual.length && actual.every(id => expected.includes(id));
const canonicalResolvedFindingIds = findings.filter(isResolvedFinding).map(finding => finding.id);
if (!sameIdSet(catalogs['baseline-v1']?.resolved_findings,canonicalResolvedFindingIds)) add('BASELINE_RESOLVED_FINDINGS_MISMATCH','baseline-v1.resolved_findings');
const findingsById = new Map(findings.map(finding => [finding.id,finding]));
const visitHealthProjections = (value, owner) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry,index) => visitHealthProjections(entry,`${owner}[${index}]`));
    return;
  }
  for (const id of Array.isArray(value.current_findings) ? value.current_findings : []) {
    const finding = findingsById.get(id);
    if (!finding || !hasTaxonomyFlag(finding,'operational_open')) add('HEALTH_CURRENT_FINDING_NOT_OPERATIONAL',`${owner}.current_findings -> ${id}`);
  }
  for (const id of Array.isArray(value.validation_queue_findings) ? value.validation_queue_findings : []) {
    const finding = findingsById.get(id);
    if (!finding || !hasTaxonomyFlag(finding,'validation_queue')) add('HEALTH_VALIDATION_FINDING_NOT_VALIDATION_QUEUE',`${owner}.validation_queue_findings -> ${id}`);
  }
  for (const id of Array.isArray(value.historical_resolved_findings) ? value.historical_resolved_findings : []) {
    const finding = findingsById.get(id);
    if (!finding || finding.status!=='RESOLVED') add('HEALTH_HISTORICAL_FINDING_NOT_RESOLVED',`${owner}.historical_resolved_findings -> ${id}`);
  }
  if (typeof value.id === 'string' && value.id.startsWith('domain.')) {
    const expectedCurrent = findings.filter(finding => finding.domains?.includes(value.id) && hasTaxonomyFlag(finding,'operational_open')).map(finding => finding.id);
    const expectedValidation = findings.filter(finding => finding.domains?.includes(value.id) && hasTaxonomyFlag(finding,'validation_queue')).map(finding => finding.id);
    const expectedHistorical = findings.filter(finding => finding.domains?.includes(value.id) && finding.status==='RESOLVED').map(finding => finding.id);
    if (!sameIds(value.current_findings,expectedCurrent) || !sameIds(value.validation_queue_findings,expectedValidation) || !sameIds(value.historical_resolved_findings,expectedHistorical)) add('HEALTH_DOMAIN_PROJECTION_MISMATCH',value.id);
  }
  for (const [key,child] of Object.entries(value)) visitHealthProjections(child,`${owner}.${key}`);
};
visitHealthProjections(catalogs.health,'health');
const expectedValidationQueue = findings.filter(finding => hasTaxonomyFlag(finding,'validation_queue')).map(finding => finding.id);
if (!sameIds(catalogs.health?.system?.validation_queue_findings,expectedValidationQueue)) add('HEALTH_VALIDATION_QUEUE_MISMATCH','health.system.validation_queue_findings');
const currentProductionSources = [
  catalogs['baseline-manifest']?.current_runtime?.production_source_commit,
  catalogs['baseline-v1']?.current_runtime?.production_source_commit,
  catalogs['risk-summary']?.current_runtime?.production_source_commit,
  catalogs.infrastructure?.vercel?.linked_project_production?.production_source_commit,
  catalogs.infrastructure?.vercel?.linked_project_production?.production_runtime_source,
  catalogs['runtime-validation']?.current_production?.application_source,
  catalogs['runtime-validation']?.current_production?.repository_source
].filter(value => typeof value === 'string' && value);
if (new Set(currentProductionSources).size > 1) add('CURRENT_INFRA_PRODUCTION_SOURCE_MISMATCH',[...new Set(currentProductionSources)].join(', '));
const canonicalFunctionalSource = manifest?.source_state?.base_commit;
for (const value of currentProductionSources) {
  if (canonicalFunctionalSource && value !== canonicalFunctionalSource) add('CURRENT_PRODUCTION_CANONICAL_SOURCE_MISMATCH',`${value} != ${canonicalFunctionalSource}`);
}
const currentCanonicalSourceProjections = [
  manifest?.quality_gate?.source_commit,
  catalogs.health?.quality_gate?.source_commit,
  catalogs.infrastructure?.github?.canonical_functional_source,
  catalogs.infrastructure?.identity_reaudit?.repository_source,
  catalogs.infrastructure?.identity_reaudit?.production_application_source,
  catalogs.infrastructure?.identity_reaudit?.canonical_functional_source,
  catalogs['runtime-validation']?.identity_reaudit?.canonical_functional_source,
  catalogs['self-reading']?.bootstrap_answers?.functional_source,
  catalogs['self-reading']?.bootstrap_answers?.canonical_source,
  catalogs['self-reading']?.bootstrap_answers?.production_runtime_source,
  catalogs['stabilization-history']?.final_state?.repository_source,
  catalogs['stabilization-history']?.final_state?.production_application_source
].filter(value => typeof value === 'string' && value);
for (const value of currentCanonicalSourceProjections) {
  if (canonicalFunctionalSource && value !== canonicalFunctionalSource) add('CURRENT_CANONICAL_SOURCE_PROJECTION_STALE',`${value} != ${canonicalFunctionalSource}`);
}
const canonicalDefaultSuiteCases = catalogs['baseline-v1']?.product_gate_status?.npm_test?.cases;
const canonicalDefaultSuiteProjection = Number.isInteger(canonicalDefaultSuiteCases) ? `${canonicalDefaultSuiteCases}/${canonicalDefaultSuiteCases}` : null;
for (const [owner,value] of [
  ['baseline-manifest.quality_gate.default_node_suite',manifest?.quality_gate?.default_node_suite],
  ['health.quality_gate.node',catalogs.health?.quality_gate?.node],
  ['self-reading.bootstrap_answers.default_suite',catalogs['self-reading']?.bootstrap_answers?.default_suite],
  ['stabilization-history.final_state.default_node_suite',catalogs['stabilization-history']?.final_state?.default_node_suite],
  ['test-gaps.method',catalogs['test-gaps']?.method]
]) {
  if (typeof value === 'string' && canonicalDefaultSuiteProjection && !value.includes(canonicalDefaultSuiteProjection)) add('CURRENT_DEFAULT_SUITE_PROJECTION_STALE',`${owner}: ${value} != ${canonicalDefaultSuiteProjection}`);
}
const completenessTestJustification = catalogs.completeness?.records?.find?.(entry => entry.area === 'TESTS')?.justification;
if (typeof completenessTestJustification === 'string') {
  if (canonicalDefaultSuiteProjection && !completenessTestJustification.includes(canonicalDefaultSuiteProjection)) add('COMPLETENESS_TEST_SUITE_PROJECTION_STALE','completeness.dimensions.TESTS.justification');
  if (!completenessTestJustification.includes(`${expected.tests} test artifacts`)) add('COMPLETENESS_TEST_COUNT_PROJECTION_STALE','completeness.dimensions.TESTS.justification');
}
const canonicalQualityGateProjection = manifest?.baseline_2_8_0?.quality_gate_run;
for (const [owner,value] of [
  ['baseline-manifest.quality_gate.quality_gate_run',manifest?.quality_gate?.quality_gate_run],
  ['health.quality_gate.run',catalogs.health?.quality_gate?.run]
]) {
  if (Number.isInteger(canonicalQualityGateProjection) && value !== canonicalQualityGateProjection) add('CURRENT_QUALITY_GATE_PROJECTION_STALE',`${owner}: ${value} != ${canonicalQualityGateProjection}`);
}
const currentProductionDeployments = [
  catalogs['baseline-manifest']?.current_runtime?.production_deployment,
  catalogs['baseline-v1']?.current_runtime?.production_deployment,
  catalogs['risk-summary']?.current_runtime?.production_deployment,
  catalogs.infrastructure?.vercel?.linked_project_production?.ready_deployment,
  catalogs.infrastructure?.vercel?.published_commit?.deployment,
  catalogs['runtime-validation']?.current_production?.deployment
].filter(value => typeof value === 'string' && value);
if (new Set(currentProductionDeployments).size > 1) add('CURRENT_PRODUCTION_DEPLOYMENT_MISMATCH',[...new Set(currentProductionDeployments)].join(', '));
const canonicalProductionDeployment = currentProductionDeployments[0];
const currentPublishedFinding = findingsById.get('risk.published-commit-unvalidated');
const publishedFindingEvidence = JSON.stringify(currentPublishedFinding?.evidence || []);
if (currentPublishedFinding?.status === 'RESOLVED' && canonicalProductionDeployment && canonicalFunctionalSource &&
    (!publishedFindingEvidence.includes(canonicalProductionDeployment) || !publishedFindingEvidence.includes(canonicalFunctionalSource))) {
  add('CURRENT_PUBLISHED_SOURCE_EVIDENCE_STALE','risk.published-commit-unvalidated');
}
const publishedSourceEvidence = unresolvedById.get('unresolved.published-source-commit');
if (publishedSourceEvidence?.status === 'RESOLVED' && canonicalProductionDeployment && canonicalFunctionalSource) {
  const evidence = String(publishedSourceEvidence.currentEvidence || '');
  if (!evidence.includes(canonicalProductionDeployment) || !evidence.includes(canonicalFunctionalSource)) add('CURRENT_UNRESOLVED_SOURCE_EVIDENCE_STALE','unresolved.published-source-commit');
}
const currentEvidenceStrings = [];
const visitCurrentEvidence = (value, owner, insideCurrent = false) => {
  if (typeof value === 'string') {
    if (insideCurrent) currentEvidenceStrings.push({ owner, value });
    return;
  }
  if (!value || typeof value !== 'object') return;
  const objectIsCurrent = insideCurrent || value.evidence_state === 'CURRENT' || value.temporal_semantics === 'CURRENT_CANONICAL_SEMANTICS';
  if (Array.isArray(value)) {
    value.forEach((entry,index) => visitCurrentEvidence(entry,`${owner}[${index}]`,objectIsCurrent));
    return;
  }
  for (const [key,child] of Object.entries(value)) {
    const fieldIsCurrent = key === 'current_evidence' || key === 'current_state' || key.startsWith('current_') || key.startsWith('CURRENT_');
    visitCurrentEvidence(child,`${owner}.${key}`,objectIsCurrent || fieldIsCurrent);
  }
};
for (const [name,catalog] of Object.entries(catalogs)) visitCurrentEvidence(catalog,name);
for (const {owner,value} of currentEvidenceStrings) {
  const suiteCounts = [
    ...value.matchAll(/\b(\d+\/\d+)\s+(?:Node|default tests)\b/ig),
    ...value.matchAll(/\bdefault(?:\s+Node)?\s+suite[^,.\n;]{0,40}\b(\d+\/\d+)\b/ig)
  ].map(match => match[1]);
  for (const count of suiteCounts) if (canonicalDefaultSuite && count !== canonicalDefaultSuite) add('CURRENT_EVIDENCE_TEST_COUNT_MISMATCH',`${owner}: ${count} != ${canonicalDefaultSuite}`);
  for (const match of value.matchAll(/\bQuality Gate(?:\s+run)?\s+(\d+)\b/ig)) {
    if (Number.isInteger(canonicalQualityGateRun) && Number(match[1]) !== canonicalQualityGateRun) add('CURRENT_EVIDENCE_QUALITY_GATE_MISMATCH',`${owner}: ${match[1]} != ${canonicalQualityGateRun}`);
  }
}
const healthFindingCounts = catalogs.health?.system?.active_findings;
if (healthFindingCounts) {
  checkDerivedCount('health.system.active_findings.P0',healthFindingCounts.P0,'active_p0');
  checkDerivedCount('health.system.active_findings.HIGH',healthFindingCounts.HIGH,'active_high');
  checkDerivedCount('health.system.active_findings.POTENTIAL_HIGH',healthFindingCounts.POTENTIAL_HIGH,'potential_high');
  checkDerivedCount('health.system.active_findings.OPEN_HIGH',healthFindingCounts.OPEN_HIGH,'open_high');
  checkDerivedCount('health.system.active_findings.RESOLVED',healthFindingCounts.RESOLVED,'resolved');
}
const baselineFindingMetrics = catalogs['baseline-v1']?.finding_status_metrics;
if (baselineFindingMetrics) for (const name of ['active_p0','active_high','potential_high','open_high','resolved']) checkDerivedCount(`baseline-v1.finding_status_metrics.${name}`,baselineFindingMetrics[name],name);
const releaseGate = catalogs['baseline-v1']?.product_gate_status?.release_gate;
if (!releaseGate || releaseGate.applicable_threshold!=='priority in {P0, P1} or severity in {CRITICAL, HIGH}') add('RELEASE_GATE_SCHEMA_INVALID','baseline-v1.product_gate_status.release_gate');
else {
  checkDerivedCount('baseline-v1.product_gate_status.release_gate.blocking_count',releaseGate.blocking_count,'release_blocking');
  checkDerivedIds('baseline-v1.product_gate_status.release_gate.blocking_findings',releaseGate.blocking_findings,'release_blocking');
  const expectedStatus = derivedGroups.release_blocking.length ? 'BLOCKED' : 'PASS';
  if (releaseGate.status!==expectedStatus) add('RELEASE_GATE_STATUS_MISMATCH',`${releaseGate.status} != ${expectedStatus}`);
}
const functionalChanges = manifest?.source_state?.functional_changes_since_base;
if (!Array.isArray(functionalChanges)) add('MANIFEST_FUNCTIONAL_CHANGES_INVALID','baseline-manifest.json');
let resolvedBaseCommit;
if (manifest?.source_state?.base_commit) {
  try {
    resolvedBaseCommit = resolveCommit(manifest.source_state.base_commit);
  } catch (error) {
    add('MANIFEST_BASE_COMMIT_INVALID',`${manifest.source_state.base_commit}: ${error.message}`);
  }
}
if (Array.isArray(functionalChanges) && functionalChanges.length === 0) {
  if (manifest?.source_state?.generated_from_working_tree !== false) add('MANIFEST_PURE_COMMIT_FLAG_INVALID','baseline-manifest.json');
  if (resolvedBaseCommit) {
    try {
      const baseSource = committedFunctionalSource(resolvedBaseCommit);
      const manifestFingerprint = manifest?.source_state?.source_tree_fingerprint;
      if (baseSource.fingerprint !== manifestFingerprint) add('MANIFEST_PURE_COMMIT_BASE_FINGERPRINT_MISMATCH',`${baseSource.fingerprint} != ${manifestFingerprint}`);
      if (currentSource?.fingerprint !== manifestFingerprint) add('MANIFEST_PURE_COMMIT_CURRENT_FINGERPRINT_MISMATCH',`${currentSource?.fingerprint} != ${manifestFingerprint}`);
      if (baseSource.fileCount !== currentSource?.fileCount) add('MANIFEST_PURE_COMMIT_FILE_COUNT_MISMATCH',`${baseSource.fileCount} != ${currentSource?.fileCount}`);

      const headDiffPaths = childProcess.execFileSync('git',['diff','--name-only','-z',`${resolvedBaseCommit}..HEAD`,'--'],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').split('\0').filter(Boolean).map(normalizeRepoPath).filter(value => !sourcePathIsExcluded(value)).sort();
      if (headDiffPaths.length) add('MANIFEST_PURE_COMMIT_FUNCTIONAL_HEAD_DIFF',headDiffPaths.join(', '));
    } catch (error) {
      add('MANIFEST_PURE_COMMIT_RECONSTRUCTION_FAILED',error.message);
    }
  }
}
for (const change of functionalChanges || []) {
  const absolute = path.join(root, change.path || '');
  if (!change.path || !fs.existsSync(absolute)) add('MANIFEST_FUNCTIONAL_CHANGE_PATH_INVALID',change.path || '(missing path)');
  else if (!change.sha256 || sha256(fs.readFileSync(absolute)) !== change.sha256) add('MANIFEST_FUNCTIONAL_CHANGE_HASH_INVALID',change.path);
}
if (manifest?.git_observation_at_generation?.validity_role!=='INFORMATIONAL_ONLY') add('MANIFEST_TRANSIENT_STATE_ROLE_INVALID','baseline-manifest.json');
if (manifest?.status==='FROZEN' && manifest?.git_observation_at_generation?.validity_role==='INFORMATIONAL_ONLY') {
  const observedHead = manifest.git_observation_at_generation.head;
  const canonicalBase = manifest.source_state?.base_commit;
  if (!observedHead || observedHead !== canonicalBase) add('MANIFEST_GIT_OBSERVATION_SOURCE_MISMATCH',`${observedHead || '(missing)'} != ${canonicalBase || '(missing)'}`);
}
if (!catalogs['self-reading']?.query_routes?.IMPACT_ANALYSIS) add('SELF_READING_ROUTE_MISSING','IMPACT_ANALYSIS');

const stabilizationHistory = catalogs['stabilization-history'];
if (stabilizationHistory) {
  const requiredArrays = ['days','milestones','remediations','audits','quality_gates','deployments','migrations','findings_resolved','new_findings_documented','remaining_risks'];
  for (const field of requiredArrays) if (!Array.isArray(stabilizationHistory[field])) add('STABILIZATION_HISTORY_SCHEMA_INVALID',field);
  if (!stabilizationHistory.period?.start || !stabilizationHistory.period?.end || stabilizationHistory.period.start > stabilizationHistory.period.end) add('STABILIZATION_HISTORY_PERIOD_INVALID','stabilization-history.json');
  const milestoneIds = new Set((stabilizationHistory.milestones||[]).map(item=>item.id));
  for (const day of stabilizationHistory.days || []) {
    if (!day.date || day.date < stabilizationHistory.period.start || day.date > stabilizationHistory.period.end) add('STABILIZATION_HISTORY_DAY_OUTSIDE_PERIOD',day.date || '(missing)');
    for (const id of day.milestone_ids || []) if (!milestoneIds.has(id)) add('STABILIZATION_HISTORY_BROKEN_MILESTONE_REFERENCE',id);
  }
  for (const id of stabilizationHistory.findings_resolved || []) {
    const finding = findings.find(item=>item.id===id);
    if (!finding || finding.status!=='RESOLVED') add('STABILIZATION_HISTORY_FINDING_NOT_RESOLVED',id);
  }
  for (const id of stabilizationHistory.remaining_risks || []) if (!sets.finding.has(id)) add('STABILIZATION_HISTORY_UNKNOWN_FINDING',id);
  if (stabilizationHistory.final_state?.baseline !== manifest?.version) add('STABILIZATION_HISTORY_BASELINE_MISMATCH','final_state.baseline');
  if (stabilizationHistory.final_state?.repository_source !== manifest?.source_state?.base_commit) add('STABILIZATION_HISTORY_SOURCE_MISMATCH','final_state.repository_source');
  if (stabilizationHistory.final_state?.source_tree_fingerprint !== fingerprint?.source_tree_fingerprint) add('STABILIZATION_HISTORY_FINGERPRINT_MISMATCH','final_state.source_tree_fingerprint');
}

if (errors.length) {
  console.error(JSON.stringify({status:'FAIL',errorCount:errors.length,errors},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',jsonFiles:jsonFiles.length,baselineArtifactsVerified:integrity.records.length,aggregateHash:integrity.aggregate_hash,counts:expected},null,2));
