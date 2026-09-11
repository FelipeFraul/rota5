import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);

test("single event more-info keeps selectedEvent so option 1 can buy next", () => {
  const singleEventBlock =
    router.match(
      /previousState\.lastEvents\?\.length === 1[\s\S]*?if \(previousState\.eventMoreInfoShown && parsedSearch\.numericSelection === 2\)/,
    )?.[0] ?? "";

  assert.match(singleEventBlock, /const eventMoreInfo = await buildEventMoreInfoSelection\(contextEvent\)/);
  assert.match(
    singleEventBlock,
    /nextContext:\s*\{[\s\S]*selectedEvent:\s*eventMoreInfo,[\s\S]*eventMoreInfoShown:\s*true/,
  );
  assert.ok(
    router.indexOf(
      'previousState.eventMoreInfoShown &&\n    previousState.selectedEvent',
    ) < router.indexOf("previousState.lastEvents?.length === 1"),
  );
});

test("all event more-info branches keep selectedEvent before showing buy option", () => {
  const moreInfoBranches = [
    router.match(
      /isAllPublicEventsContext\(previousState\)[\s\S]*?if \(selectedAction\.action === "more_info"\)[\s\S]*?return renderBuyerSectionsStepAfterBuyRevalidation/,
    )?.[0] ?? "",
    router.match(
      /!isAllPublicEventsContext\(previousState\)[\s\S]*?previousState\.lastEvents\.length > 1[\s\S]*?if \(selectedAction\.action === "more_info"\)[\s\S]*?return renderBuyerSectionsStepAfterBuyRevalidation/,
    )?.[0] ?? "",
    router.match(
      /previousState\.lastEvents\?\.length === 1[\s\S]*?if \(previousState\.eventMoreInfoShown && parsedSearch\.numericSelection === 2\)/,
    )?.[0] ?? "",
  ];

  for (const branch of moreInfoBranches) {
    assert.match(branch, /(?:selectedEvent,|selectedEvent:\s*eventMoreInfo,)[\s\S]*eventMoreInfoShown:\s*true/);
  }
});
