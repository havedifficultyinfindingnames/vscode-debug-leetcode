import * as fse from 'fs-extra';
import * as net from 'net';
// import * as path from "path";
import * as vscode from 'vscode';
import { leetCodeChannel } from '../leetCodeChannel';
import { fileMeta, getEntryFile } from '../utils/problemUtils';
import { cppExecutor } from './executor/cppExecutor';
import problemTypes from '../problems/problemTypes';

export interface IDebugConfig {
    type: string;
    program?: string;
    env?: {
        [key: string]: any;
    };
    [x: string]: any;
}

const debugConfigMap: Map<string, IDebugConfig> = new Map([
    [
        'javascript',
        {
            type: 'node',
        },
    ],
    [
        'python3',
        {
            type: 'python',
            env: {
                PYTHONPATH: '',
            },
        },
    ],
]);

export interface IProblemType {
    funName: string;
    paramTypes: string[];
    returnType: string;
    testCase: string;
    specialFunName?: {
        [x: string]: string;
    };
}

interface IDebugResult {
    type: 'success' | 'error';
    message: string;
    problemNum: number;
    language: string;
    filePath: string;
    testString: string;
}

class DebugExecutor {
    private server: net.Server;

    constructor() {
        this.start();
    }

    private getCppDebuggerType(): 'cppdbg' | 'lldb' | undefined {
        const cppExtension = vscode.extensions.getExtension('ms-vscode.cpptools');
        const clangdExtension = vscode.extensions.getExtension(
            'llvm-vs-code-extensions.vscode-clangd',
        );
        const codelldbExtension = vscode.extensions.getExtension('vadimcn.vscode-lldb');
        if (cppExtension?.isActive) {
            vscode.window.showInformationMessage('Detected Microsoft C/C++ extension.');
            return 'cppdbg';
        }
        if (clangdExtension?.isActive && codelldbExtension?.isActive) {
            vscode.window.showInformationMessage('Detected clangd and CodeLLDB extensions.');
            return 'lldb';
        }
        if (codelldbExtension?.isActive) {
            vscode.window.showInformationMessage(
                'Detected CodeLLDB extension. For best experience, consider installing clangd extension as well.',
            );
            return 'lldb';
        }
        return undefined;
    }

    public async execute(
        filePath: string,
        testString: string,
        language: string,
    ): Promise<string | undefined> {
        if (this.server == null || this.server.address() == null) {
            vscode.window.showErrorMessage('Debug server error, maybe you can restart vscode.');
            return;
        }

        if (language === 'cpp') {
            const debuggerType = this.getCppDebuggerType();
            if (!debuggerType) {
                vscode.window.showErrorMessage(
                    'No suitable C++ debugger found. Please install one of the following extensions:\n' +
                        '• Microsoft C/C++ (ms-vscode.cpptools) for cppdbg debugger\n' +
                        '• clangd (llvm-vs-code-extensions.vscode-clangd) + CodeLLDB (vadimcn.vscode-lldb) for lldb debugger',
                );
                return;
            }

            await cppExecutor.execute(
                filePath,
                testString,
                language,
                this.server.address().port,
                debuggerType,
            );
            return;
        }

        const debugConfig: undefined | IDebugConfig = debugConfigMap.get(language);
        if (debugConfig == null) {
            vscode.window.showErrorMessage('Notsupported language.');
            return;
        }

        const fileContent: Buffer = await fse.readFile(filePath);
        const meta: { id: string; lang: string } | null = fileMeta(fileContent.toString());
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

        debugConfig.program = await getEntryFile(meta.lang, meta.id);

        const funName: string = this.getProblemFunName(language, problemType);

        if (language === 'javascript') {
            // check whether module.exports is exist or not
            const moduleExportsReg: RegExp = new RegExp(`module.exports = ${problemType.funName};`);
            if (!moduleExportsReg.test(fileContent.toString())) {
                fse.writeFile(
                    filePath,
                    fileContent.toString() +
                        `\n// @after-stub-for-debug-begin\nmodule.exports = ${funName};\n// @after-stub-for-debug-end`,
                );
            }
        } else if (language === 'python3') {
            // check whether module.exports is exist or not
            const moduleExportsReg: RegExp = /# @before-stub-for-debug-begin/;
            if (!moduleExportsReg.test(fileContent.toString())) {
                await fse.writeFile(
                    filePath,
                    `# @before-stub-for-debug-begin\nfrom python3problem${meta.id} import *\nfrom typing import *\n# @before-stub-for-debug-end\n\n` +
                        fileContent.toString(),
                );
            }
            debugConfig.env!.PYTHONPATH = debugConfig.program;
        }

        const args: string[] = [
            filePath,
            testString,
            problemType.funName,
            problemType.paramTypes.join(','),
            problemType.returnType,
            meta.id,
            this.server.address().port.toString(),
        ];
        vscode.debug.startDebugging(
            undefined,
            Object.assign({}, debugConfig, {
                request: 'launch',
                name: 'Launch Program',
                args,
            }),
        );

        return;
    }

    /**
     * for some problem have special function name
     * @param language
     * @param problemType
     */
    private getProblemFunName(language: string, problemType: IProblemType): string {
        if (problemType.specialFunName && problemType.specialFunName[language]) {
            return problemType.specialFunName[language];
        }
        return problemType.funName;
    }

    private async start(): Promise<any> {
        this.server = net.createServer((clientSock: net.Socket) => {
            clientSock.setEncoding('utf8');

            clientSock.on('data', async (data: Buffer) => {
                const result: IDebugResult = JSON.parse(data.toString());
                if (result.type === 'error') {
                    vscode.window.showErrorMessage(result.message);
                } else {
                    // const leetcodeResult: string = await leetCodeExecutor.testSolution(
                    //     result.filePath,
                    //     parseTestString(result.testString.replace(/\\"/g, '"')),
                    // );
                    // if (!leetcodeResult) {
                    //     return;
                    // }
                    // leetCodeSubmissionProvider.show(leetcodeResult);
                }
            });

            clientSock.on('error', (error: Error) => {
                leetCodeChannel.appendLine(error.toString());
            });
        });

        this.server.on('error', (error: Error) => {
            leetCodeChannel.appendLine(error.toString());
        });

        // listen on a random port
        this.server.listen({ port: 0, host: '127.0.0.1' });
    }
}

export const debugExecutor: DebugExecutor = new DebugExecutor();
