#include <stdio.h>

int value = 0;

void get(int input, int (*callback)(int));

int callback(int input, int (*callback)(int)) {
	return callback(input);
}

int callback1(int input) {
	return input + 1;
}
int callback2(int input) {
	return input + 2;
}

int call(int input)
{
	int (*callback)(int);
	if (input<2) {
		callback = callback1;
	} else {
		callback = callback2;
	}
	get(input, callback);
	return value;
}