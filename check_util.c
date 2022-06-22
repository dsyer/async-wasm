#include <stdio.h>
#include <check.h>

#include "./util.c"

START_TEST(test_manifest)
{
	char *result = computeManifestUrl("apps/foo");
	printf("%s\n", result);
}
END_TEST

START_TEST(test_token)
{
	char *result = computeTokenUrl("Bearer realm=https://foo.com,service=foo,scope=bar");
	printf("%s\n", result);
	if (strcmp(result, "https://foo.com?service=foo&scope=bar") != 0) {
		ck_abort_msg("Should be %s but was %s", "https://foo.com?service=foo&scope=bar", result);
	}
}
END_TEST

START_TEST(test_token_quoted)
{
	char *result = computeTokenUrl("Bearer realm=\"https://foo.com\",service=\"foo\",scope=\"bar\"");
	printf("%s\n", result);
	if (strcmp(result, "https://foo.com?service=foo&scope=bar") != 0) {
		ck_abort_msg("Should be %s but was %s", "https://foo.com?service=foo&scope=bar", result);
	}
}
END_TEST

Suite *suite(void)
{
	Suite *s;
	TCase *tc_core;
	TCase *tc_limits;

	s = suite_create("Words");

	/* Core test case */
	tc_core = tcase_create("Core");

	tcase_add_test(tc_core, test_manifest);
	tcase_add_test(tc_core, test_token);
	tcase_add_test(tc_core, test_token_quoted);
	suite_add_tcase(s, tc_core);

	return s;
}

/*
 * $ gcc -o test -l check check_util.c
 * $ ./test
 * Running suite(s): Words
 * 0%: Checks: 1, Failures: 1, Errors: 0
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