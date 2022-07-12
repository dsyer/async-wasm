import assert from "assert";

import { call } from "../image.js";

async function noimage() {
    var result = await call({});
    console.log("noimage:", result);
    assert.ok(!result.complete);
}

async function google() {
    var result = await call({ spec: { image: "https://google.com" }});
    assert.strictEqual(result.status, 301);
}

async function fetchStatus(resource) {
    console.log("end to end:", resource);
    var result = await call(resource);
    console.log("result:", result);
    assert.strictEqual(result.complete, true);
    assert.ok(result.latestImage);
}

await noimage();
// await google();
await fetchStatus({ spec: { image: "localhost:5000/apps/demo" } });
await fetchStatus({ spec: { image: "nginx" } });

console.log("ok");
