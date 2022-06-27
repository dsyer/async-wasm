#[cfg(test)]
mod tests {

    use rmpv::{decode, encode, Utf8String, Value};

    use crate::{compute_manifest_url, compute_token_url};

    #[test]
    fn rmp() {
        let mut buf = Vec::new();
        let values = vec![(
            Value::String(Utf8String::from("url")),
            Value::String(Utf8String::from("https://google.com")),
        )];
        let value = Value::Map(values);
        encode::write_value(&mut buf, &value).ok();

        println!("{:x?}", buf.clone());

        let result = decode::read_value(&mut &buf[..]).ok().unwrap();
        assert_eq!(true, value.is_map());
        let len = result.as_map().unwrap().len();
        assert_eq!(1, len);

        let fields = value.as_map().unwrap();
        let key = fields[0].0.as_str().unwrap();
        assert_eq!("url", key);

        let value = fields[0].1.as_str().unwrap();
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
        assert_eq!(
            "https://index.docker.io/v2/library/demo/manifests/latest",
            url
        );
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
