import * as k8s from "@kubernetes/client-node";
import { call } from "../image.js";

const CUSTOMRESOURCE_GROUP = "example.com";
const CUSTOMRESOURCE_VERSION = "v1";
const CUSTOMRESOURCE_PLURAL = "images";

class V1ImageSpec {
}

class V1ImageStatus {
	complete = false;
}

class V1Image {
	constructor(obj) {
		obj && Object.assign(this, obj);
	}
	apiVersion = "v1";
	kind = "Image";
	metadata = new k8s.V1ObjectMeta();
	spec = new V1ImageSpec();
	status = new V1ImageStatus();
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApiImage = kc.makeApiClient(k8s.CustomObjectsApi);

const watch = new k8s.Watch(kc);

async function watchResource() {
	log("Watching API");
	return watch.watch(
		`/apis/${CUSTOMRESOURCE_GROUP}/${CUSTOMRESOURCE_VERSION}/${CUSTOMRESOURCE_PLURAL}`,
		{},
		onEvent,
		onDone,
	);
}

function onDone(err) {
	log(`Connection closed. ${err}`);
	watchResource();
}

async function onEvent(phase, apiObj) {
	log(`Received event in phase ${phase}.`);
	if (phase == "ADDED") {
		scheduleReconcile(apiObj);
	} else if (phase == "MODIFIED") {
		try {
			scheduleReconcile(apiObj);
		} catch (err) {
			log(err);
		}
	} else if (phase == "DELETED") {
		await deleteResource(apiObj);
	} else {
		log(`Unknown event type: ${phase}`);
	}
}

async function deleteResource(obj) {
	log(`Deleted ${obj.metadata.name}`);
}

let reconcileScheduled = false;

function scheduleReconcile(obj) {
	if (!reconcileScheduled) {
		setTimeout(reconcileNow, 1000, obj);
		reconcileScheduled = true;
	}
}

async function reconcileNow(obj) {
	reconcileScheduled = false;
	const image = new V1Image(obj);
	log(`Reconciling "${image.metadata.name}"`);
	var status = await call(image);
	if (status) {
		log(`Status for "${image.metadata.name}" complete: ${status.complete}`)
		image.status = status;
		await k8sApiImage.replaceNamespacedCustomObjectStatus(CUSTOMRESOURCE_GROUP, CUSTOMRESOURCE_VERSION, image.metadata.namespace, CUSTOMRESOURCE_PLURAL, image.metadata.name, image);
	}
}

async function main() {
	await watchResource();
}

function log(message) {
	console.log(`${new Date().toLocaleString()}: ${message}`);
}

process.on("unhandledRejection", (reason, p) => {
	console.log("Unhandled Rejection, reason:", reason.message);
});

main();