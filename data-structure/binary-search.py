def binary_search(numbers, target, low=0, high=None):
    if high is None:
        high = len(numbers) - 1

    if low > high:
        return -1
    mid = (low + high) // 2

    if numbers[mid] == target:
        return mid
    elif numbers[mid] < target:
        return binary_search(numbers, target, mid + 1, high)
    else:
        return binary_search(numbers, target, low, mid - 1)


numbers = [3, 7, 12, 18, 24, 31, 40, 55, 68, 79]
target = 55
result = binary_search(numbers, target)
print("Numbers:", numbers)
print("Searching for:", target)
print("Found at index:", result)
