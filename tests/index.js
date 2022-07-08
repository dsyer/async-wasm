import assert from "assert";

import { call } from "../image.js";

async function google() {
    var result = await call({ url: "https://google.com" });
    assert.strictEqual(result.status, 301);
}

async function localhost() {
    console.log("end to end localhost");
    var result = await call({ spec: { image: "localhost:5000/apps/demo" } });
    console.log("result", result);
    assert.strictEqual(result.complete, true);
    assert.ok(result.latestImage);
}

async function dockerhub() {
    console.log("end to end dockerhub");
    var result = await call({ spec: { image: "nginx" } });
    console.log("result", result);
    assert.strictEqual(result.complete, true);
    assert.ok(result.latestImage);
}

google();
// await localhost();
// await dockerhub();

console.log("ok");
