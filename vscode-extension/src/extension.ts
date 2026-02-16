import * as vscode from 'vscode';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface QuizData {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    knowledgeSummary: string;
}

let mcpClient: Client | null = null;
let currentPanel: vscode.WebviewPanel | null = null;
let currentQuizData: QuizData | null = null;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Live-time Quiz extension is now active!');

    await initMCPClient();

    let showQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.showQuiz', async () => {
        if (!currentQuizData) {
            vscode.window.showInformationMessage('暂无测验题目，请先让AI生成测验');
            return;
        }
        showQuizPanel(context, currentQuizData);
    });

    let enableQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.enableQuiz', () => {
        vscode.workspace.getConfiguration().update('liveTimeQuiz.enabled', true, true);
        vscode.window.showInformationMessage(' Live-time Quiz ');
    });

    let disableQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.disableQuiz', () => {
        vscode.workspace.getConfiguration().update('liveTimeQuiz.enabled', false, true);
        vscode.window.showInformationMessage(' Live-time Quiz ');
    });

    let receiveQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.receiveQuizData', (quizData: QuizData) => {
        currentQuizData = quizData;
        showQuizPanel(context, quizData);
    });

    context.subscriptions.push(showQuizCommand, enableQuizCommand, disableQuizCommand, receiveQuizCommand);
}

async function initMCPClient() {
    try {
        const transport = new StdioClientTransport({
            command: "node",
            args: ["dist/index.js"],
        });

        mcpClient = new Client({ name: "vscode-quiz-extension", version: "1.0.0" });
        await mcpClient.connect(transport);
        console.log("MCP Client connected");
    } catch (error) {
        console.error("Failed to connect to MCP server:", error);
    }
}

export function deactivate() {
    if (mcpClient) {
        mcpClient.close();
    }
}

function showQuizPanel(context: vscode.ExtensionContext, quizData: QuizData) {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        currentPanel.webview.html = getQuizWebviewContent(quizData);
    } else {
        currentPanel = createQuizPanel(context, quizData);
    }
}

function createQuizPanel(context: vscode.ExtensionContext, quizData: QuizData): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        'liveTimeQuiz',
        '🎯 知识测验',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    panel.webview.html = getQuizWebviewContent(quizData);

    panel.onDidDispose(() => {
        currentPanel = null;
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(
        async (message: { command: string; sessionId: string; selectedIndex: number }) => {
            switch (message.command) {
                case 'submitAnswer':
                    await handleAnswerSubmit(message.sessionId, message.selectedIndex);
                    return;
                case 'skipQuiz':
                    handleSkipQuiz(message.sessionId);
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    return panel;
}

async function handleAnswerSubmit(sessionId: string, selectedIndex: number) {
    if (!mcpClient) {
        vscode.window.showErrorMessage('MCP 服务器未连接');
        return;
    }

    try {
        const result = await mcpClient.callTool({
            name: "submit_answer",
            arguments: { sessionId, selectedIndex }
        });

        const feedback = (result.content as Array<{ text?: string }>)?.[0]?.text || '';
        const isCorrect = feedback.includes('✅') || feedback.includes('正确');

        if (currentPanel) {
            currentPanel.webview.postMessage({
                command: 'showResult',
                isCorrect,
                feedback
            });
        }
    } catch (error) {
        vscode.window.showErrorMessage(`提交答案失败: ${error}`);
    }
}

function handleSkipQuiz(sessionId: string) {
    if (!mcpClient) return;
    
    mcpClient.callTool({
        name: "skip_quiz",
        arguments: { sessionId }
    }).catch(console.error);

    vscode.window.showInformationMessage('测验已跳过');
    currentPanel?.dispose();
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getQuizWebviewContent(quizData: QuizData): string {
    const optionsHtml = quizData.options.map((opt, i) => `
        <div class="option" data-index="${i}" onclick="selectOption(${i})">
            <span class="letter">${String.fromCharCode(65 + i)}</span>
            <span class="text">${escapeHtml(opt)}</span>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识测验</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .card {
            background: rgba(255, 255, 255, 0.98);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 650px;
            width: 100%;
            padding: 32px;
        }
        .header { text-align: center; margin-bottom: 22px; }
        .icon { font-size: 44px; margin-bottom: 8px; }
        .title { font-size: 22px; font-weight: 800; color: #2d3748; }
        .question {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-radius: 14px;
            padding: 20px;
            margin-bottom: 18px;
            border-left: 5px solid #667eea;
        }
        .question-text { font-size: 16px; font-weight: 650; color: #2d3748; line-height: 1.6; }
        .option {
            display: flex;
            align-items: center;
            padding: 16px 18px;
            margin-bottom: 10px;
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .option:hover:not(.disabled) {
            border-color: #667eea;
            transform: translateX(6px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }
        .option.disabled { cursor: not-allowed; opacity: 0.7; }
        .option.correct { 
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); 
            border-color: #48bb78; 
            color: white; 
        }
        .option.wrong { 
            background: linear-gradient(135deg, #fc8181 0%, #e53e3e 100%); 
            border-color: #fc8181; 
            color: white; 
        }
        .letter {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            margin-right: 14px;
            flex-shrink: 0;
        }
        .option.correct .letter, .option.wrong .letter { background: white; }
        .option.correct .letter { color: #48bb78; }
        .option.wrong .letter { color: #e53e3e; }
        .text { font-size: 14px; font-weight: 550; line-height: 1.5; }
        .result { 
            display: none; 
            margin-top: 20px;
            padding: 16px;
            border-radius: 12px;
            animation: fadeIn 0.3s ease;
        }
        .result.show { display: block; }
        .result.correct { background: #f0fff4; border: 2px solid #48bb78; }
        .result.wrong { background: #fff5f5; border: 2px solid #fc8181; }
        @keyframes fadeIn { 
            from { opacity: 0; transform: translateY(10px); } 
            to { opacity: 1; transform: translateY(0); } 
        }
        .result-title { 
            font-size: 18px; 
            font-weight: 800; 
            text-align: center; 
            margin-bottom: 12px; 
        }
        .result-title.correct { color: #38a169; }
        .result-title.wrong { color: #e53e3e; }
        .explain {
            color: #4a5568;
            font-size: 14px;
            line-height: 1.7;
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }
        .btn {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-2px); }
        .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
        }
        .btn-secondary:hover { background: #cbd5e0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon">🎯</div>
            <div class="title">知识测验</div>
        </div>
        <div class="question">
            <div class="question-text">${escapeHtml(quizData.question)}</div>
        </div>
        <div id="options">${optionsHtml}</div>
        <div id="result" class="result">
            <div id="result-title" class="result-title"></div>
            <div class="explain" id="explain"></div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="skipQuiz()">跳过</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const quizData = ${JSON.stringify(quizData)};
        let answered = false;

        function selectOption(index) {
            if (answered) return;
            answered = true;

            vscode.postMessage({
                command: 'submitAnswer',
                sessionId: quizData.id,
                selectedIndex: index
            });

            const options = document.querySelectorAll('.option');
            options.forEach((el, i) => {
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                if (i === quizData.correctIndex) el.classList.add('correct');
                else if (i === index && index !== quizData.correctIndex) el.classList.add('wrong');
            });
        }

        function skipQuiz() {
            vscode.postMessage({ command: 'skipQuiz', sessionId: quizData.id });
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'showResult') {
                const resultDiv = document.getElementById('result');
                const titleDiv = document.getElementById('result-title');
                const explainDiv = document.getElementById('explain');
                resultDiv.classList.add('show');
                resultDiv.classList.add(msg.isCorrect ? 'correct' : 'wrong');
                titleDiv.classList.add(msg.isCorrect ? 'correct' : 'wrong');
                titleDiv.textContent = msg.isCorrect ? '✅ 回答正确！' : '❌ 回答错误';
                explainDiv.textContent = quizData.explanation;
            }
        });
    </script>
</body>
</html>`;
}
