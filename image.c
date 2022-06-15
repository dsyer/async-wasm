#include "mpack.h"
#include <stdlib.h>

void get(char *input, size_t len);
char *computeManifestUrl(char *image);

typedef struct _buffer
{
	char *data;
	size_t len;
} buffer;

mpack_node_t parse(char *input, size_t len)
{
	mpack_tree_t tree;
	mpack_tree_init_data(&tree, input, len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);
	return root;
}

char *extractImage(char *input, size_t len)
{
	mpack_node_t root = parse(input, len);
	if (!mpack_node_map_contains_cstr(root, "headers"))
	{
		return NULL;
	}
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
	char *buffer = malloc(rlen + 1);
	mpack_node_copy_cstr(header, buffer, rlen + 1);
	return buffer;
}

buffer *callback(char *input, size_t len)
{
	char *digest = extractImage(input, len);

	mpack_writer_t writer;
	buffer *result = malloc(sizeof(buffer));
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

	return result;
}

void call(char *input, size_t len)
{
	mpack_node_t root = parse(input, len);
	mpack_node_t spec = mpack_node_map_cstr_optional(root, "spec");
	if (mpack_node_is_missing(spec))
	{
		return;
	}
	mpack_node_t image = mpack_node_map_cstr_optional(spec, "image");
	if (mpack_node_is_missing(image))
	{
		return;
	}
	int rlen = mpack_node_strlen(image);
	char *path = malloc(rlen + 1);
	mpack_node_copy_cstr(image, path, rlen + 1);
	char *url = computeManifestUrl(path);
	free(path);

	buffer *result = malloc(sizeof(buffer));
	mpack_writer_t writer;
	mpack_writer_init_growable(&writer, &result->data, &result->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "url");
	mpack_write_cstr(&writer, url);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);

	get(result->data, result->len);
}