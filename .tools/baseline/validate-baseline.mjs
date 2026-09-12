import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';

const root = process.cwd();
const docsDir = path.join(root, 'docs', 'system');
const jsonDir = path.join(root, 'system-knowledge');
const errors = [];
const add = (code, detail) => errors.push({ code, detail });
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(jsonDir, name), 'utf8'));

const required = [
  'baseline-manifest.json','baseline-v1.json','index.json','self-reading.json',
  'source-fingerprint.json','changelog.json','baseline-integrity.json'
];
for (const name of required) if (!fs.existsSync(path.join(jsonDir, name))) add('MISSING_CANONICAL_FILE', `system-knowledge/${name}`);
for (const name of ['AI-READ-ME.md','BASELINE-V1.md','CANONICAL-INDEX.md','GOVERNANCE.md','CHANGE-PROTOCOL.md','CHANGELOG.md','KNOWN-LIMITS.md','NEXT-ACTIONS.md']) {
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
    const groups = [value.records, value.nodes, value.edges, value.tables, value.functions, value.triggers, value.indexes, value.migrations].filter(Array.isArray);
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
for (const x of capabilities) { checkRefs(x.id,'domain',[x.domain],sets.domain); checkRefs(x.id,'entrypoints',x.entrypoints,sets.entrypoint); checkRefs(x.id,'modules',x.modules,sets.module); checkRefs(x.id,'tables',x.database_tables,sets.table); checkRefs(x.id,'functions',x.database_functions,sets.function); checkRefs(x.id,'triggers',x.database_triggers,sets.trigger); checkRefs(x.id,'integrations',x.integrations,sets.integration); checkRefs(x.id,'tests',(x.tests||[]).filter(v=>v.startsWith('test-')),sets.test); }
for (const x of flows) { checkRefs(x.id,'domains',x.domains,sets.domain); checkRefs(x.id,'modules',x.modules,sets.module); checkRefs(x.id,'entrypoints',x.entrypoints,sets.entrypoint); checkRefs(x.id,'capabilities',x.capabilities,sets.capability); checkRefs(x.id,'tables',x.tables,sets.table); checkRefs(x.id,'functions',x.database_functions,sets.function); checkRefs(x.id,'triggers',x.database_triggers,sets.trigger); checkRefs(x.id,'integrations',x.integrations,sets.integration); checkRefs(x.id,'tests',(x.tests||[]).filter(v=>v.startsWith('test-')),sets.test); }
for (const x of steps) { checkRefs(x.id,'flow',[x.flow],sets.flow); checkRefs(x.id,'capability',[x.capability],sets.capability); checkRefs(x.id,'entrypoint',x.entrypoint?[x.entrypoint]:[],sets.entrypoint); checkRefs(x.id,'module',x.module?[x.module]:[],sets.module); checkRefs(x.id,'next',(x.possible_next_steps||[]).filter(v=>v.includes('.step_')),sets.step); }
for (const x of transitions) { checkRefs(x.id,'flow',[x.flow],sets.flow); checkRefs(x.id,'capability',[x.capability],sets.capability); }
for (const x of getRecords('capability-relations')) { checkRefs(x.id,'from',[x.from],sets.capability); checkRefs(x.id,'to',[x.to],sets.capability); }
for (const x of getRecords('flow-relations')) { checkRefs(x.id,'from',[x.from],sets.flow); checkRefs(x.id,'to',[x.to],sets.flow); }
for (const x of getRecords('finding-relations')) { checkRefs(`${x.from}->${x.to}`,'from',[x.from],sets.finding); checkRefs(`${x.from}->${x.to}`,'to',[x.to],sets.finding); }

const expected = {domains:17,modules:66,entrypoints:56,capabilities:140,flows:34,'flow-steps':169,'state-transitions':66,'data-model':44,'database-relations':2223,integrations:6,webhooks:2,cron:2,environment:44,tests:43,findings:44};
for (const [name, count] of Object.entries(expected)) if (getRecords(name).length !== count) add('CANONICAL_COUNT_MISMATCH', `${name}: expected ${count}, got ${getRecords(name).length}`);
if ((objects.migrations||[]).length !== 77) add('CANONICAL_COUNT_MISMATCH','migrations');
if ((objects.functions||[]).length !== 33) add('CANONICAL_COUNT_MISMATCH','sql functions');
if ((objects.triggers||[]).length !== 33) add('CANONICAL_COUNT_MISMATCH','triggers');
if ((catalogs.capabilities?.metrics?.by_status?.DESCONHECIDA || 0) !== 0) add('UNCLASSIFIED_CAPABILITY','capabilities.metrics.by_status.DESCONHECIDA');
if ((catalogs.flows?.metrics?.capabilities_unclassified || 0) !== 0) add('UNCLASSIFIED_CAPABILITY','flows.metrics.capabilities_unclassified');
if ((catalogs.flows?.metrics?.functional_entrypoints_unclassified || 0) !== 0) add('UNCLASSIFIED_ENTRYPOINT','flows.metrics.functional_entrypoints_unclassified');
if (flows.some(flow=>!flow.status)) add('FLOW_WITHOUT_STATUS','flows.json');
if ((catalogs.contradictions?.pending ?? -1) !== 0) add('PENDING_CONTRADICTION','contradictions.json');
if ((catalogs['unresolved-evidence']?.count ?? 0) !== 10) add('UNRESOLVED_EVIDENCE_DRIFT','unresolved-evidence.json');

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
if (fingerprint) {
  for (const key of ['head','branch','origin_production','package_lock_sha256','migrations_aggregate_hash','source_tree_fingerprint','freeze_timestamp']) if (!fingerprint[key]) add('SOURCE_FINGERPRINT_FIELD_MISSING',key);
  const canonicalExclusions=['docs/system/**','system-knowledge/**','.tools/baseline/**','**/.stage*'];
  if (JSON.stringify(fingerprint.source_tree_exclusions)!==JSON.stringify(canonicalExclusions)) add('SOURCE_FINGERPRINT_EXCLUSIONS_INVALID','Canonical baseline and .stage exclusions are required.');
  const excluded=(value)=>{
    const normalized=value.replaceAll('\\','/');
    if(normalized.startsWith('docs/system/')||normalized.startsWith('system-knowledge/')||normalized.startsWith('.tools/baseline/')) return true;
    return normalized.split('/').some(segment=>segment.startsWith('.stage'));
  };
  const tracked=childProcess.execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean).map(value=>value.replaceAll('\\','/')).filter(value=>!excluded(value)).sort();
  const material=tracked.map(value=>value+'\0'+sha256(fs.readFileSync(path.join(root,value)))+'\n').join('');
  if(fingerprint.source_tree_file_count!==tracked.length) add('SOURCE_FINGERPRINT_FILE_COUNT_MISMATCH',`${fingerprint.source_tree_file_count} != ${tracked.length}`);
  if(fingerprint.source_tree_fingerprint!==sha256(Buffer.from(material,'utf8'))) add('SOURCE_TREE_FINGERPRINT_MISMATCH','source-fingerprint.json');
}
const manifest = catalogs['baseline-manifest'];
if (manifest?.baseline_id!=='rota5-baseline-v1'||manifest?.version!=='1.0.0'||manifest?.status!=='FROZEN') add('MANIFEST_IDENTITY_INVALID','baseline-manifest.json');
if (!catalogs['self-reading']?.query_routes?.IMPACT_ANALYSIS) add('SELF_READING_ROUTE_MISSING','IMPACT_ANALYSIS');

if (errors.length) {
  console.error(JSON.stringify({status:'FAIL',errorCount:errors.length,errors},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',jsonFiles:jsonFiles.length,baselineArtifactsVerified:integrity.records.length,aggregateHash:integrity.aggregate_hash,counts:expected},null,2));
