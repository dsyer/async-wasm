import http from 'http';

export function get(request) {
	return new Promise((resolve, reject) => {
		var url = request.url;
		var headers = request.headers;
		http.get(url, { "headers": headers }, response => {
			response.setEncoding('utf8');
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
		});
	});
}

export function log(str) {
	console.log(str);
}