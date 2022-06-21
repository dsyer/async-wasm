#include <stdio.h>
#include <stdbool.h>

typedef struct
{
	void (*callback)(int);
	int value;
} Result;

Result get(Result (*result)(int), int input);

Result callback(Result (*callback)(int), int input)
{
	return callback(input);
}

Result callback0(int input)
{
	Result result = {NULL, input + 1};
	return result;
}

Result callback1(int input)
{
	return get(callback0, input + 1);
}

Result callback2(int input)
{
	if (input < 2)
	{
		return get(callback1, input);
	}
	Result result = {NULL, input + 3};
	return result;
}

Result call(int input)
{
	return get(callback2, input);
}