#include <string.h>
#include <stdlib.h>

void replace(char *string, char *target, char *value) {
	char *sub = strstr(string, target);
	if (!sub) {
		return;
	}
	int tlen = strlen(target);
	int vlen = strlen(value);
	int slen = strlen(string);
	for (char *ptr = string + slen + vlen - tlen; ptr-->sub + tlen;) {
		ptr[vlen - tlen] = ptr[0];
	}
	for (char *ptr = sub; ptr < sub + vlen; ptr++) {
		ptr[0] = value[ptr-sub];
	}
}

void merge(char *target, char *prefix, char *suffix) {
	int len = strlen(prefix);
	if (target!=prefix) {
		strcpy(target, prefix);
	}
	strcpy(target + len, suffix);
}

char *computeManifestUrl(char *image)
{
	char label[] = "latest"; // TODO: extract from image path
	char protocol[] = "https://";
	char *path = malloc(strlen(image) + 30);
	if (!strstr(image, "/"))
	{
		merge(path, "library/", image);
	}
	else
	{
		strcpy(path, image);
	}
	if (!strstr(image, ".") && !strstr(image, ":"))
	{
		char *tmp = malloc(strlen(path));
		strcpy(tmp, path);
		// No host
		merge(path, "index.docker.io/", tmp);
		free(tmp);
	}
	replace(path, "/", "/v2/");
	char start[9];
	memcpy(start, path, strlen(path) < 9 ? strlen(path) : 9);
	if (strncmp(path, "localhost", 9) == 0)
	{
		strcpy(protocol, "http://");
		// TODO: check for KUBERNETES env vars and
		// path = path.replaceFirst("localhost", "registry");
	}
	char *url = malloc(strlen(protocol) + strlen(path) + strlen(label) + strlen("/manifests/"));
	merge(url, protocol, path);
	merge(url, url, "/manifests/");
	merge(url, url, label);
	free(path);
	return url;
}
