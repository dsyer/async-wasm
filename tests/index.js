import assert from "assert";

import { call } from "../image.js";


// var result = await call({ url: "https://google.com" });
console.log("end to end localhost");
var result = await call({ spec: { image: "localhost:5000/apps/demo" } });
console.log("result", result);
assert.strictEqual(result.complete, true);
assert.ok(result.latestImage);

console.log("end to end dockerhub");
result = await call({ spec: { image: "nginx" } });
console.log("result", result);
assert.strictEqual(result.complete, true);
assert.ok(result.latestImage);

console.log("ok");
