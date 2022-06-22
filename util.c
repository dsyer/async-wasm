#include <string.h>
#include <stdlib.h>

void replace(char *string, char *target, char *value)
{
	char *sub = strstr(string, target);
	if (!sub)
	{
		return;
	}
	int tlen = strlen(target);
	int vlen = strlen(value);
	int slen = strlen(string);
	for (char *ptr = string + slen + vlen - tlen; ptr-- > sub + tlen;)
	{
		ptr[vlen - tlen] = ptr[0];
	}
	for (char *ptr = sub; ptr < sub + vlen; ptr++)
	{
		ptr[0] = value[ptr - sub];
	}
}

void merge(char *target, char *prefix, char *suffix)
{
	int len = strlen(prefix);
	if (target != prefix && target != suffix)
	{
		strcpy(target, prefix);
		strcpy(target + len, suffix);
	}
	else if (target != prefix)
	{
		char *tmp = malloc(strlen(target) + 1);
		strcpy(tmp, target);
		strcpy(target, prefix);
		strcpy(target + len, tmp);
		free(tmp);
	}
	else
	{
		strcpy(target + len, suffix);
	}
}

char *find(char *fields, char *field)
{
	const char delim[] = ",";
	char *token = strtok(fields, delim);

	while (token)
	{
		if (strstr(token, field)) {
			int nlen = strlen(field);
			int tlen = strlen(token) - nlen;
			if (token[nlen] == '"') {
				char* result = malloc(tlen - 1);
				strncpy(result, token + nlen + 1, tlen - 2);
				result[tlen-2] = '\0';
				return result;
			}
			return strdup(token + nlen);
		}
		token = strtok(0, delim);
	}
	return NULL;
}

char *computeTokenUrl(char *auth)
{
	char *path = malloc(strlen(auth) + 1);
	if (!strstr(auth, "Bearer "))
	{
		return NULL;
	}
	char *copy = malloc(strlen(auth) + 1 - strlen("Bearer "));
	strcpy(copy, auth + strlen("Bearer "));
	char *realm = find(strdup(copy), "realm=");
	char *scope = find(strdup(copy), "scope=");
	char *service = find(strdup(copy), "service=");

	if (!realm || !scope || !service) {
		return NULL;
	}

	merge(path, realm, "?service=");
	merge(path, path, service);
	merge(path, path, "&scope=");
	merge(path, path, scope);

	free(realm);
	free(service);
	free(scope);

	return path;
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
		// No host
		merge(path, "index.docker.io/", path);
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
