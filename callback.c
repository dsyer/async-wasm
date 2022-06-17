#include <stdio.h>

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

void call(int input)
{
	int (*callback)(int);
	if (input<2) {
		callback = callback1;
	} else {
		callback = callback2;
	}
	get(input, callback);
}