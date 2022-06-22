#include <stdio.h>
#include <check.h>

#include "./image.c"

char *url;

mpack_node_t parse(char *data, size_t len) {
	mpack_tree_t tree;
	mpack_tree_init_data(&tree, data, len);
	mpack_tree_parse(&tree);
	mpack_node_t root = mpack_tree_root(&tree);
	return root;
}

buffer get(buffer (*fn)(buffer *), buffer *input)
{
	mpack_node_t node = parse(input->data, input->len);
	int ulen = mpack_node_strlen(mpack_node_map_cstr(node, "url"));
	char *buffer = malloc(ulen + 1);
	if (ulen)
	{
		mpack_node_copy_cstr(mpack_node_map_cstr(node, "url"), buffer, ulen + 1);
	}
	url = buffer;
	printf("{url: \"%s\"}\n", buffer);
	return *input;
}

START_TEST(test_call)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "spec");
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "image");
	mpack_write_cstr(&writer, "apps/foo");
	mpack_complete_map(&writer);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	call(input->data, input->len);
	if (!url)
	{
		ck_abort_msg("Should be a url");
	}
	free(input);
	if (url) {
		free(url);
	}
}
END_TEST

START_TEST(test_manifest_no_digest)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "status");
	mpack_write_int(&writer, 200);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	buffer result = callback(status, input);
	mpack_node_t node = parse(result.data, result.len);
	bool complete = mpack_node_bool(mpack_node_map_cstr(node, "complete"));
	if (complete)
	{
		ck_abort_msg("Should be incomplete");
	}
	free(input);
}
END_TEST

START_TEST(test_manifest)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "status");
	mpack_write_int(&writer, 200);
	mpack_write_cstr(&writer, "headers");
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "docker-content-digest");
	mpack_write_cstr(&writer, "foobarspam");
	mpack_complete_map(&writer);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	buffer result = callback(status, input);
	mpack_node_t node = parse(result.data, result.len);
	int len = mpack_node_strlen(mpack_node_map_cstr(node, "latest_image"));
	char *buffer = malloc(len + 1);
	mpack_node_copy_cstr(mpack_node_map_cstr(node, "latest_image"), buffer, len + 1);
	printf("{image: \"%s\"}\n", buffer);
	if (len == 0)
	{
		ck_abort_msg("No latest image: %s", buffer);
	}
	bool complete = mpack_node_bool(mpack_node_map_cstr(node, "complete"));
	if (!complete)
	{
		ck_abort_msg("Should be complete");
	}
	free(input);
}
END_TEST

START_TEST(test_digest)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "headers");
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "docker-content-digest");
	mpack_write_cstr(&writer, "foobarspam");
	mpack_complete_map(&writer);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	char *result = extractImage(parse(input->data, input->len));
	printf("{digest: \"%s\"}\n", result);
	if (strcmp(result, "foobarspam") != 0)
	{
		ck_abort_msg("Headers were wrong: %s", result);
	}
}
END_TEST

START_TEST(test_digest_caps)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "headers");
	mpack_build_map(&writer);
	mpack_write_cstr(&writer, "Docker-Content-Digest");
	mpack_write_cstr(&writer, "foobarspam");
	mpack_complete_map(&writer);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	char *result = extractImage(parse(input->data, input->len));
	printf("{digest: \"%s\"}\n", result);
	if (strcmp(result, "foobarspam") != 0)
	{
		ck_abort_msg("Headers were wrong: %s", result);
	}
}
END_TEST

START_TEST(test_digest_no_headers)
{
	mpack_writer_t writer;
	buffer *input = malloc(sizeof(buffer));
	mpack_writer_init_growable(&writer, &input->data, &input->len);
	mpack_build_map(&writer);
	mpack_complete_map(&writer);
	mpack_writer_destroy(&writer);
	char *result = extractImage(parse(input->data, input->len));
	if (result)
	{
		ck_abort_msg("Headers were empty but result was not");
	}
}
END_TEST

Suite *suite(void)
{
	Suite *s;
	TCase *tc_core;
	TCase *tc_limits;

	s = suite_create("Messages");

	/* Core test case */
	tc_core = tcase_create("Core");

	tcase_add_test(tc_core, test_digest);
	tcase_add_test(tc_core, test_digest_caps);
	tcase_add_test(tc_core, test_digest_no_headers);
	tcase_add_test(tc_core, test_manifest_no_digest);
	tcase_add_test(tc_core, test_manifest);
	tcase_add_test(tc_core, test_call);
	suite_add_tcase(s, tc_core);

	return s;
}

/*
 * $ mkdir -p native
 * $ (cd ../wasm-mpack; make clean; make)
 * $ cp -rf build/release/* native
 * $ gcc -o test -l check -I native/include/ check_image.c -L native/lib/ -l mpack
 * $ ./test
 * Running suite(s): Messages
 * 100%: Checks: 1, Failures: 0, Errors: 0
 */
int main(void)
{
	int number_failed;
	Suite *s;
	SRunner *sr;

	s = suite();
	sr = srunner_create(s);

	srunner_run_all(sr, CK_NORMAL);
	number_failed = srunner_ntests_failed(sr);
	srunner_free(sr);
	return (number_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}