import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { extensionState } from '../../extensionState';
import { leetCodeChannel } from '../../leetCodeChannel';
import { executeCommand } from '../../utils/cpUtils';
import {
    fileMeta,
    getEntryFile,
    getProblemSpecialCode,
    randomString,
} from '../../utils/problemUtils';
import { IDebugConfig, IProblemType } from '../debugExecutor';
import problemTypes from '../../problems/problemTypes';
import { isWindows } from '../../utils/osUtils';
import { getExtensionContext } from '../../extension';

const templateMap: any = {
    116: [117],
    429: [559, 589, 590],
};

function getTemplateId(id: string): string {
    const findKey: string | undefined = Object.keys(templateMap).find((key: string) => {
        const numId: number = parseInt(id, 10);
        return templateMap[key].includes(numId);
    });
    return findKey ? findKey : id;
}

class CppExecutor {
    public async execute(
        filePath: string,
        testString: string,
        language: string,
        port: number,
        debuggerType: 'cppdbg' | 'lldb',
    ): Promise<string | undefined> {
        const sourceFileContent: string = (await fse.readFile(filePath)).toString();
        const meta: { id: string; lang: string } | null = fileMeta(sourceFileContent);
        if (meta == null) {
            vscode.window.showErrorMessage(
                "File meta info has been changed, please check the content: '@lc app=leetcode.cn id=xx lang=xx'.",
            );
            return;
        }
        const problemType: IProblemType = problemTypes[meta.id];
        if (problemType == null) {
            vscode.window.showErrorMessage(`Notsupported problem: ${meta.id}.`);
            return;
        }

        const program = await getEntryFile(meta.lang, meta.id);

        const commonHeaderName: string = `common${language}problem${meta.id}.h`;
        const commonImplementName: string = `common${language}problem${meta.id}.cpp`;

        const moduleExportsReg: RegExp = /\/\/ @before-stub-for-debug-begin/;
        if (!moduleExportsReg.test(sourceFileContent)) {
            const newContent: string =
                `// @before-stub-for-debug-begin
#include "${commonHeaderName}"
// Intentionally include the header again for clangd
#include <bits/stdc++.h>
using namespace std;
// @before-stub-for-debug-end\n\n` + sourceFileContent;
            await fse.writeFile(filePath, newContent);
        }

        const params: string[] = testString.split('\\n');
        const paramsType: string[] = problemType.paramTypes;
        if (params.length !== paramsType.length) {
            vscode.window.showErrorMessage('Input parameters do not match the problem!');
            return;
        }

        const templateId: string = getTemplateId(meta.id);

        const indent: string = '    ';
        let insertCode: string = `vector<string> params{${params
            .map((p: string) => `"${p}"`)
            .join(', ')}};\n`;
        const callArgs: string[] = [];
        paramsType.map((type: string, index: number) => {
            callArgs.push(`arg${index}`);

            insertCode += `
    string param${index} = params[${index}];
    cJSON *item${index} = cJSON_Parse(param${index}.c_str());
`;
            switch (type) {
                case 'number':
                    insertCode += `${indent}int arg${index} = parseNumber(item${index});\n`;
                    break;
                case 'number[]':
                    insertCode += `${indent}vector<int> arg${index} = parseNumberArray(item${index});\n`;
                    break;
                case 'number[][]':
                    insertCode += `${indent}vector<vector<int>> arg${index} = parseNumberArrayArray(item${index});\n`;
                    break;
                case 'string':
                    insertCode += `${indent}string arg${index} = parseString(item${index});\n`;
                    break;
                case 'string[]':
                    insertCode += `${indent}vector<string> arg${index} = parseStringArray(item${index});\n`;
                    break;
                case 'string[][]':
                    insertCode += `${indent}vector<vector<string>> arg${index} = parseStringArrayArray(item${index});\n`;
                    break;
                case 'ListNode':
                    insertCode += `${indent}ListNode *arg${index} = parseListNode(parseNumberArray(item${index}));\n`;
                    break;
                case 'ListNode[]':
                    insertCode += `${indent}vector<ListNode *> arg${index} = parseListNodeArray(parseNumberArrayArray(item${index}));\n`;
                    break;
                case 'character':
                    insertCode += `${indent}char arg${index} = parseCharacter(item${index});\n`;
                    break;
                case 'character[]':
                    insertCode += `${indent}vector<char> arg${index} = parseCharacterArray(item${index});\n`;
                    break;
                case 'character[][]':
                    insertCode += `${indent}vector<vector<char>> arg${index} = parseCharacterArrayArray(item${index});\n`;
                    break;
                case 'NestedInteger[]':
                    insertCode += `${indent}vector<NestedInteger> arg${index} = parseNestedIntegerArray(item${index});\n`;
                    break;
                case 'MountainArray':
                    insertCode += `${indent}MountainArray arg${index} = MountainArray(parseNumberArray(item${index}));\n`;
                    break;
                case 'TreeNode':
                    insertCode += `${indent}TreeNode * arg${index} = parseTreeNode(item${index});\n`;
                    break;
                case 'Node':
                    if (templateId === '133') {
                        insertCode += `${indent}Node * arg${index} = parseNode(parseNumberArrayArray(item${index}));\n`;
                    } else if (templateId === '138') {
                        insertCode += `${indent}Node * arg${index} = parseNode(parsecJSONArray(item${index}));\n`;
                    } else {
                        insertCode += `${indent}Node * arg${index} = parseNode(item${index});\n`;
                    }
                    break;
            }
        });
        if (templateId === '278') {
            insertCode += `${indent}badVersion = arg1;\n`;
            insertCode += `${indent}(new Solution())->${problemType.funName}(arg0);\n`;
        } else if (templateId === '341') {
            insertCode += `${indent}NestedIterator i(arg0);\n`;
            insertCode += `${indent}while (i.hasNext()) cout << i.next();;\n`;
        } else if (templateId === '843') {
            insertCode += `${indent}secret = arg0;\n`;
            insertCode += `${indent}Master master;\n`;
            insertCode += `${indent}(new Solution())->${problemType.funName}(arg1, master);\n`;
        } else if (templateId === '1095') {
            insertCode += `${indent}(new Solution())->${problemType.funName}(arg1, arg0);\n`;
        } else {
            insertCode += `${indent}(new Solution())->${problemType.funName}(${callArgs.join(
                ', ',
            )});\n`;
        }

        const includeFileRegExp: RegExp = /\/\/ @@stub\-for\-include\-code@@/;
        const codeRegExp: RegExp = /\/\/ @@stub\-for\-body\-code@@/;
        const entryFile: string = program;
        const entryFileContent: string = (await fse.readFile(entryFile)).toString();

        const newEntryFileContent: string = entryFileContent
            .replace(includeFileRegExp, `#include "${path.basename(filePath)}"`)
            .replace(codeRegExp, insertCode);
        await fse.writeFile(entryFile, newEntryFileContent);

        const extDir: string = getExtensionContext().extensionPath;

        // copy common.h
        const commonHeaderPath: string = path.join(extDir, 'src/debug/entry/cpp/problems/common.h');
        const commonHeaderContent: string = (await fse.readFile(commonHeaderPath)).toString();
        const commonHeaderDestPath: string = path.join(extensionState.cachePath, commonHeaderName);

        const specialDefineCode: string = await getProblemSpecialCode(
            language,
            templateId,
            'h',
            extDir,
        );
        await fse.writeFile(
            commonHeaderDestPath,
            commonHeaderContent.replace(
                /\/\/ @@stub\-for\-problem\-define\-code@@/,
                specialDefineCode,
            ),
        );

        // copy common.cpp
        const commonPath: string = path.join(extDir, 'src/debug/entry/cpp/problems/common.cpp');
        const commonContent: string = (await fse.readFile(commonPath))
            .toString()
            .replace(includeFileRegExp, `#include "${commonHeaderName}"`);
        const commonDestPath: string = path.join(extensionState.cachePath, commonImplementName);

        const specialCode: string = await getProblemSpecialCode(
            language,
            templateId,
            'cpp',
            extDir,
        );
        await fse.writeFile(
            commonDestPath,
            commonContent.replace(/\/\/ @@stub\-for\-problem\-define\-code@@/, specialCode),
        );

        const exePath: string = path.join(
            extensionState.cachePath,
            `${language}problem${meta.id}.exe`,
        );
        const thirdPartyPath: string = path.join(extDir, 'src/debug/thirdparty/c');
        const jsonPath: string = path.join(extDir, 'src/debug/thirdparty/c/cJSON.c');

        const compiler = vscode.workspace
            .getConfiguration('debug-leetcode')
            .get<string>('cppCompiler');
        let debugConfig: any;
        debugConfig = await this.compileAndGetDebugConfig(
            program,
            exePath,
            commonDestPath,
            jsonPath,
            thirdPartyPath,
            filePath,
            compiler,
            debuggerType,
        );

        if (debugConfig == null) {
            return;
        }

        const args: string[] = [
            filePath,
            testString.replace(/\\"/g, '\\\\"'),
            problemType.funName,
            problemType.paramTypes.join(','),
            problemType.returnType,
            meta.id,
            port.toString(),
        ];
        const debugSessionName: string = randomString(16);
        const debuging: boolean = await vscode.debug.startDebugging(
            undefined,
            Object.assign({}, debugConfig, {
                request: 'launch',
                name: debugSessionName,
                args,
            }),
        );

        if (debuging) {
            const debugSessionDisposes: vscode.Disposable[] = [];

            debugSessionDisposes.push(
                vscode.debug.onDidTerminateDebugSession((event: vscode.DebugSession) => {
                    if (event.name === debugSessionName) {
                        debugSessionDisposes.map((d: vscode.Disposable) => d.dispose());
                    }
                }),
            );
        }

        return;
    }

    private async compileAndGetDebugConfig(
        program: string,
        exePath: string,
        commonDestPath: string,
        jsonPath: string,
        thirdPartyPath: string,
        filePath: string,
        cppCompiler: string | undefined,
        debuggerType: 'cppdbg' | 'lldb',
    ) {
        const debugConfig: IDebugConfig = {
            type: debuggerType,
        };

        if (debuggerType === 'lldb') {
            debugConfig.externalConsole = false;
        } else {
            debugConfig.setupCommands = [
                {
                    description: 'Enable pretty-printing for gdb',
                    text: '-enable-pretty-printing',
                    ignoreFailures: true,
                },
            ];
            debugConfig.miDebuggerPath = isWindows() ? 'gdb.exe' : 'gdb';
        }

        try {
            const includePath: string = path.dirname(exePath);
            const userFileDir: string = path.dirname(filePath);

            const cppStandard =
                vscode.workspace.getConfiguration('debug-leetcode').get<string>('cppStandard') ??
                'c++23';

            let compiler: string;
            if (cppCompiler) {
                compiler = cppCompiler;
            } else {
                compiler = debuggerType === 'lldb' ? 'clang++' : 'g++';
            }
            if (debuggerType === 'lldb' && !compiler.includes('clang')) {
                const errorMsg = `LLDB debugger requires clang++ compiler, but got: ${compiler}. Please set 'debug-leetcode.cppCompiler' to empty or 'clang++' in VS Code settings.`;
                vscode.window.showErrorMessage(errorMsg);
                leetCodeChannel.append(`[ERROR] ${errorMsg}`);
                leetCodeChannel.show();
                return;
            }

            const compileArgs = [
                `-std=${cppStandard}`,
                '-g',
                '-Wall',
                '-Wno-deprecated',
                program,
                commonDestPath,
                jsonPath,
                '-o',
                exePath,
                '-I',
                includePath,
                '-I',
                userFileDir,
                '-I',
                thirdPartyPath,
            ];

            if (compiler.includes('clang')) {
                compileArgs.push('-stdlib=libstdc++');
            }

            await this.generateCompileCommands(userFileDir, program, compiler, compileArgs);

            leetCodeChannel.appendLine(`${compiler} ${compileArgs.join(' ')}`);
            leetCodeChannel.appendLine('');
            await executeCommand(compiler, compileArgs, { shell: false });
        } catch (e) {
            vscode.window.showErrorMessage(e);
            leetCodeChannel.append(e.stack);
            leetCodeChannel.show();
            return;
        }

        debugConfig.program = exePath;
        debugConfig.cwd = extensionState.cachePath;
        return debugConfig;
    }

    private async generateCompileCommands(
        userFileDir: string,
        program: string,
        compiler: string,
        compileArgs: string[],
    ): Promise<void> {
        try {
            const compileCommands = {
                directory: path.dirname(program),
                command: `${compiler} ${compileArgs.join(' ')} -c ${program}`,
                file: program,
            };

            const compileCommandsPath = path.join(userFileDir, 'compile_commands.json');

            let existingCommands: any[] = [];

            try {
                const existingContent = await fse.readFile(compileCommandsPath, 'utf8');
                const parsed = JSON.parse(existingContent);
                if (Array.isArray(parsed)) {
                    existingCommands = parsed;
                }
            } catch (readError) {
                if ((readError as any).code !== 'ENOENT') {
                    leetCodeChannel.appendLine(
                        `Warning: Failed to parse existing compile_commands.json, creating new file: ${readError}`,
                    );
                }
                existingCommands = [];
            }

            const existingIndex = existingCommands.findIndex((cmd) => cmd.file === program);
            if (existingIndex >= 0) {
                existingCommands[existingIndex] = compileCommands;
                leetCodeChannel.appendLine(
                    `Updated existing entry in compile_commands.json for: ${program}`,
                );
            } else {
                existingCommands.push(compileCommands);
            }

            await fse.writeFile(compileCommandsPath, JSON.stringify(existingCommands, null, 2));
        } catch (error) {
            leetCodeChannel.appendLine(
                `Warning: Failed to generate compile_commands.json: ${error}`,
            );
        }
    }
}

export const cppExecutor: CppExecutor = new CppExecutor();
