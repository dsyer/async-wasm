#[cfg(test)]
mod tests {

    use rmp::{decode, encode};

    use crate::{compute_token_url, compute_manifest_url};

    #[test]
    fn rmp() {
        let mut buf = Vec::new();
        encode::write_map_len(&mut buf, 1).unwrap();
        encode::write_str(&mut buf, "url").unwrap();
        encode::write_str(&mut buf, "https://google.com").unwrap();

        println!("{:x?}", buf.clone());

        let len = decode::read_map_len(&mut &buf[..])
            .unwrap()
            .try_into()
            .unwrap();
        assert_eq!(1, len);

        let key = decode::read_str_from_slice(&buf[1..]).unwrap().0;
        assert_eq!("url", key);

        let value = decode::read_str_from_slice(&buf[5..]).unwrap().0;
        assert_eq!("https://google.com", value);
    }

	#[test]
	fn manifest_docker() {
		let path = "apps/demo";
		let url = compute_manifest_url(path);
		assert_eq!("https://index.docker.io/v2/apps/demo/manifests/latest", url);
	}

	#[test]
	fn manifest_docker_library() {
		let path = "demo";
		let url = compute_manifest_url(path);
		assert_eq!("https://index.docker.io/v2/library/demo/manifests/latest", url);
	}

	#[test]
	fn manifest_localhost() {
		let path = "localhost:5000/apps/demo";
		let url = compute_manifest_url(path);
		assert_eq!("http://localhost:5000/v2/apps/demo/manifests/latest", url);
	}

	#[test]
	fn token() {
		let path = "Bearer realm=https://foo.com,service=foo,scope=bar";
		let url = compute_token_url(path);
		assert_eq!("https://foo.com?service=foo&scope=bar", url);
	}

	#[test]
	fn token_quoted() {
		let path = "Bearer realm=\"https://foo.com\",service=\"foo\",scope=\"bar\"";
		let url = compute_token_url(path);
		assert_eq!("https://foo.com?service=foo&scope=bar", url);
	}
}
