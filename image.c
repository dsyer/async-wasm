#include "mpack.h"
#include <stdlib.h>
#include "util.c"

typedef struct
{
	char *data;
	size_t len;
	void (*callback)(void *);
	void *context;
	size_t clen;
	void *index;
} future;

future get(future (*fn)(future *), future *input);

future callback(future (*fn)(future *), future *input)
{
	return fn(input);
}

future status(future *input);

future *reset(future *result) {
	result->data = NULL;
	result->len = 0;
	result->callback = NULL;
	result->clen = 0;
	return result;
}

future token(future *input)
{

	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input->data, input->len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);

	future *result = reset(input);

	mpack_node_t data = mpack_node_map_cstr_optional(root, "data");
	if (mpack_node_is_missing(data))
	{
		return *result;
	}
	mpack_node_t field = mpack_node_map_cstr_optional(data, "token");
	if (mpack_node_is_missing(field))
	{
		return *result;
	}
	int rlen = mpack_node_strlen(field);
	char *token = malloc(rlen + 1);
	mpack_node_copy_cstr(field, token, rlen + 1);
	char *auth = malloc(rlen + 1 + strlen("Bearer "));
	merge(auth, "Bearer ", token);
	free(token);

	mpack_writer_t writer;
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);

	mpack_write_cstr(&writer, "url");
	mpack_write_cstr(&writer, (char *)input->context);
	mpack_write_cstr(&writer, "headers");
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "authorization");
	mpack_write_cstr(&writer, auth);
	mpack_complete_map(&writer);

	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);

	free(auth);

	return get(status, result);
}

future authentication(future *input)
{

	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input->data, input->len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);

	future *result = reset(input);
	mpack_node_t headers = mpack_node_map_cstr_optional(root, "headers");
	if (mpack_node_is_missing(headers))
	{
		return *result;
	}
	mpack_node_t header = mpack_node_map_cstr_optional(headers, "www-authenticate");
	if (mpack_node_is_missing(header))
	{
		header = mpack_node_map_cstr_optional(headers, "WWW-Authenticate");
		if (mpack_node_is_missing(header))
		{
			return *result;
		}
	}
	int rlen = mpack_node_strlen(header);
	char *auth = malloc(rlen + 1);
	mpack_node_copy_cstr(header, auth, rlen + 1);

	mpack_writer_t writer;
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);

	if (strstr(auth, "error="))
	{
		mpack_write_cstr(&writer, "complete");
		mpack_write_bool(&writer, false);
		mpack_complete_map(&writer);
		mpack_writer_destroy(&writer);
		return *result;
	}
	mpack_write_cstr(&writer, "url");
	mpack_write_cstr(&writer, computeTokenUrl(auth));

	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);

	return get(token, result);
}

char *extractImage(mpack_node_t root)
{
	mpack_node_t headers = mpack_node_map_cstr_optional(root, "headers");
	if (mpack_node_is_missing(headers))
	{
		return NULL;
	}
	mpack_node_t header = mpack_node_map_cstr_optional(headers, "Docker-Content-Digest");
	if (mpack_node_is_missing(header))
	{
		header = mpack_node_map_cstr_optional(headers, "docker-content-digest");
		if (mpack_node_is_missing(header))
		{
			return NULL;
		}
	}
	int rlen = mpack_node_strlen(header);
	char *image = malloc(rlen + 1);
	mpack_node_copy_cstr(header, image, rlen + 1);
	return image;
}

future status(future *input)
{
	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input->data, input->len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);

	mpack_node_t status = mpack_node_map_cstr_optional(root, "status");
	int code = mpack_node_int(status);
	if (code == 401)
	{
		return authentication(input);
	}

	char *digest = extractImage(root);

	mpack_writer_t writer;
	future *result = reset(input);
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);
	if (digest)
	{
		mpack_write_cstr(&writer, "complete");
		mpack_write_bool(&writer, true);
		mpack_write_cstr(&writer, "latest_image");
		mpack_write_cstr(&writer, digest);
	}
	else
	{
		mpack_write_cstr(&writer, "complete");
		mpack_write_bool(&writer, false);
	}
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);

	return *result;
}

future call(char *input, size_t len)
{
	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input, len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);

	future *result = malloc(sizeof(future));
	mpack_node_t spec = mpack_node_map_cstr_optional(root, "spec");
	if (mpack_node_is_missing(spec))
	{
		return *result;
	}
	mpack_node_t image = mpack_node_map_cstr_optional(spec, "image");
	if (mpack_node_is_missing(image))
	{
		return *result;
	}
	int rlen = mpack_node_strlen(image);
	char *path = malloc(rlen + 1);
	mpack_node_copy_cstr(image, path, rlen + 1);
	char *url = computeManifestUrl(path);
	free(path);

	mpack_writer_t writer;
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "url");
	mpack_write_cstr(&writer, url);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	result->context = url;

	return get(status, result);
}