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
			if (response.statusCode == 401) {
				var auth = response.headers['www-authenticate'];
				if (auth && auth.startsWith("Bearer ")) {
					var fields = JSON.parse('{"' + auth.replace("Bearer ", "").replaceAll(',',',"').replaceAll('=','":') + '}');
					getter.get(fields.realm+"?service="+fields.service+"&scope="+fields.scope, {"headers": headers}, res => {
						finish(res, value => {
							var token = JSON.parse(value.data).token;
							headers['Authorization'] = "Bearer " + token;
							getter.get(url, { "headers": headers }, actual => {
								finish(actual, resolve, reject);
							});
						}, reject);
					});
				}
			} else {
				finish(response, resolve, reject);
			}
		});
	});
}