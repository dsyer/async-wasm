#include <stdio.h>
#include <check.h>

#include "./util.c"

START_TEST(test_manifest)
{
	char *result = computeManifestUrl("apps/foo");
	printf("%s\n", result);
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