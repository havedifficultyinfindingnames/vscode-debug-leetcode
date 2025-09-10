# Debug LeetCode

> Solve LeetCode problems in VS Code and enjoy debugging

> [!NOTE]
> Forked from [vscode-debug-leetcode](https://github.com/wangtao0101/vscode-debug-leetcode/). Major changes include clangd support for debugging c++.

-   English Document | [中文文档](https://github.com/havedifficultyinfindingnames/vscode-debug-leetcode/blob/master/docs/README_zh-CN.md)

# Attention

> This extension should work with [vscode-leetcode](https://marketplace.visualstudio.com/items?itemName=shengchen.vscode-leetcode)

## Debug a Problem

![debug](https://raw.githubusercontent.com/havedifficultyinfindingnames/vscode-debug-leetcode/master/docs/gifs/debug.gif)

> Currently debug-leetcode only support Python3, Javascript and cpp language and in the future we will support more lanuages which support vscode debug protocal. Welcome to get PR for another language. My next plan is to support c and java.

> Not all problems are supported(most free problems are supported) and only supported problems have debug option.

> If you have any issue about the debug feature, you can [create a issue](https://github.com/havedifficultyinfindingnames/vscode-debug-leetcode/issues/new?template=bug.md) with detail information

## Python3 debug

### Requirement

-   Step 1. Install the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) for Visual Studio Code.

-   Step 2. Install a supported version of Python3 on your system (note: that the system install of Python on macOS is not supported) and add python command to your environment.

## Cpp debug

### Requirement

-   Step 1. Install the [C/C++ extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) for Visual Studio Code. **or**  
Step 1. Install the [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb) and [clangd](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd) for Visual Studio Code.

-   Step 2. Install gcc or clang with gnu sysroot.

## Javasript debug

Nothing just vscode

## Be careful ❗️

Extention will generate some stub code in your current file like:

For python:

```python
# @before-stub-for-debug-begin
from python3problem1 import *
from typing import *
# @before-stub-for-debug-end
```

For javascript

```js
// @after-stub-for-debug-begin
module.exports = twoSum;
// @after-stub-for-debug-end
```

For cpp

```cpp
// @before-stub-for-debug-begin
#include "commoncppproblem4.h"
// @before-stub-for-debug-end
```

If you delete some stub code and forget to restore, you can delete all the stub code and the extension will generate again in next debug.

---
