import http from 'http';
import https from 'https';

function finish(response, resolve, reject) {
	let data = '';
	response.on('data', (chunk) => {
		data += chunk.toString();
	});
	response.on('end', () => {
		resolve({data: data, headers: response.headers, status: response.statusCode});
	});
	response.on('error', (error) => {
		reject(error);
	});
}

export function get(request) {
	return new Promise((resolve, reject) => {
		var url = request.url;
		var headers = request.headers || {};
		var getter = http;
		if (url.startsWith("https:")) {
			getter = https;
		}
		getter.get(url, { "headers": headers }, response => {
			response.setEncoding('utf8');
			finish(response, resolve, reject);
		});
	});
}