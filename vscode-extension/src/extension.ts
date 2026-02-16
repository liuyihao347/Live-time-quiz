import * as vscode from 'vscode';

interface QuizData {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    knowledgeSummary: string;
}

interface QuizSession {
    quiz: QuizData;
    answered: boolean;
    selectedIndex?: number;
    isCorrect?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Live-time Quiz extension is now active!');

    // 注册命令
    let showQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.showQuiz', () => {
        const panel = createQuizPanel(context);
        panel.webview.html = getQuizWebviewContent(context);
    });

    let enableQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.enableQuiz', () => {
        vscode.workspace.getConfiguration().update('liveTimeQuiz.enabled', true, true);
        vscode.window.showInformationMessage('✅ Live-time Quiz 已启用');
    });

    let disableQuizCommand = vscode.commands.registerCommand('liveTimeQuiz.disableQuiz', () => {
        vscode.workspace.getConfiguration().update('liveTimeQuiz.enabled', false, true);
        vscode.window.showInformationMessage('🚫 Live-time Quiz 已禁用');
    });

    context.subscriptions.push(showQuizCommand, enableQuizCommand, disableQuizCommand);

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('liveTimeQuiz')) {
            console.log('Live-time Quiz configuration changed');
        }
    });
}

function createQuizPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        'liveTimeQuiz',
        '🎯 Live-time Quiz',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    // 处理来自webview的消息
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'submitAnswer':
                    handleAnswerSubmit(message.sessionId, message.selectedIndex);
                    return;
                case 'skipQuiz':
                    handleSkipQuiz(message.sessionId);
                    return;
                case 'showFeedback':
                    showDetailedFeedback(message.sessionId);
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    return panel;
}

function handleAnswerSubmit(sessionId: string, selectedIndex: number) {
    // 这里可以与MCP服务器通信验证答案
    console.log(`Answer submitted for session ${sessionId}: ${selectedIndex}`);
    
    // 向用户展示反馈
    const isCorrect = true; // 这里应该从MCP服务器获取结果
    const message = isCorrect ? '✅ 回答正确！' : '❌ 回答错误，再看一下解析吧';
    
    vscode.window.showInformationMessage(message, '查看详细解析', '继续学习')
        .then(selection => {
            if (selection === '查看详细解析') {
                showDetailedFeedback(sessionId);
            }
        });
}

function handleSkipQuiz(sessionId: string) {
    vscode.window.showInformationMessage('测验已跳过，随时可以重新开始！');
}

function showDetailedFeedback(sessionId: string) {
    // 显示详细反馈面板
    console.log(`Showing detailed feedback for session ${sessionId}`);
}

function getQuizWebviewContent(context: vscode.ExtensionContext): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live-time Quiz</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .quiz-container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            backdrop-filter: blur(10px);
        }

        .quiz-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .quiz-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }

        .quiz-title {
            font-size: 24px;
            font-weight: 700;
            color: #333;
            margin-bottom: 8px;
        }

        .quiz-subtitle {
            font-size: 14px;
            color: #666;
        }

        .question-box {
            background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 25px;
            border-left: 5px solid #667eea;
        }

        .question-text {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            line-height: 1.6;
        }

        .options-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 25px;
        }

        .option {
            display: flex;
            align-items: center;
            padding: 18px 20px;
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .option:hover {
            background: #e9ecef;
            border-color: #667eea;
            transform: translateX(5px);
        }

        .option.selected {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: #667eea;
            color: white;
        }

        .option-letter {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #667eea;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            margin-right: 15px;
            flex-shrink: 0;
        }

        .option.selected .option-letter {
            background: white;
            color: #667eea;
        }

        .option-text {
            font-size: 15px;
            font-weight: 500;
        }

        .actions {
            display: flex;
            gap: 12px;
        }

        .btn {
            flex: 1;
            padding: 15px 25px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        .btn-secondary {
            background: #f8f9fa;
            color: #666;
            border: 2px solid #e9ecef;
        }

        .btn-secondary:hover {
            background: #e9ecef;
        }

        .result-panel {
            display: none;
            animation: fadeIn 0.5s ease;
        }

        .result-panel.show {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .result-icon {
            font-size: 64px;
            text-align: center;
            margin-bottom: 20px;
        }

        .result-title {
            font-size: 22px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 15px;
        }

        .result-correct {
            color: #28a745;
        }

        .result-wrong {
            color: #dc3545;
        }

        .explanation-box {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
        }

        .explanation-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .explanation-text {
            font-size: 14px;
            color: #666;
            line-height: 1.7;
        }

        .session-info {
            font-size: 12px;
            color: #999;
            text-align: center;
            margin-top: 20px;
        }

        .progress-bar {
            width: 100%;
            height: 6px;
            background: #e9ecef;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 25px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 3px;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="quiz-container">
        <div class="quiz-header">
            <div class="quiz-icon">🎯</div>
            <h1 class="quiz-title">知识测验</h1>
            <p class="quiz-subtitle">巩固你的学习成果</p>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" style="width: 50%"></div>
        </div>

        <div id="quiz-panel">
            <div class="question-box">
                <p class="question-text" id="question-text">
                    基于刚才的学习内容，以下哪项是最重要的知识点？
                </p>
            </div>

            <div class="options-container" id="options-container">
                <div class="option" data-index="0">
                    <span class="option-letter">A</span>
                    <span class="option-text">需要仔细理解核心概念</span>
                </div>
                <div class="option" data-index="1">
                    <span class="option-letter">B</span>
                    <span class="option-text">应该关注实现细节</span>
                </div>
                <div class="option" data-index="2">
                    <span class="option-letter">C</span>
                    <span class="option-text">要注意常见错误</span>
                </div>
                <div class="option" data-index="3">
                    <span class="option-letter">D</span>
                    <span class="option-text">重点是实践应用</span>
                </div>
            </div>

            <div class="actions">
                <button class="btn btn-primary" id="submit-btn">提交答案</button>
                <button class="btn btn-secondary" id="skip-btn">跳过测验</button>
            </div>
        </div>

        <div class="result-panel" id="result-panel">
            <div class="result-icon" id="result-icon">✅</div>
            <h2 class="result-title result-correct" id="result-title">回答正确！</h2>
            
            <div class="explanation-box">
                <div class="explanation-title">
                    <span>💡</span>
                    <span>知识解析</span>
                </div>
                <p class="explanation-text" id="explanation-text">
                    理解核心概念是掌握知识的基础，细节和实践都应该建立在概念理解之上。通过理解核心概念，你可以更好地应用知识解决实际问题。
                </p>
            </div>

            <div class="actions" style="margin-top: 25px;">
                <button class="btn btn-primary" id="next-btn">继续学习</button>
                <button class="btn btn-secondary" id="review-btn">查看详情</button>
            </div>
        </div>

        <div class="session-info" id="session-info">
            Session ID: quiz_placeholder
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedIndex = null;
        let sessionId = 'quiz_' + Date.now();

        // 更新session id显示
        document.getElementById('session-info').textContent = 'Session ID: ' + sessionId;

        // 选项点击事件
        document.querySelectorAll('.option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                selectedIndex = parseInt(option.dataset.index);
            });
        });

        // 提交按钮
        document.getElementById('submit-btn').addEventListener('click', () => {
            if (selectedIndex === null) {
                alert('请先选择一个选项！');
                return;
            }

            vscode.postMessage({
                command: 'submitAnswer',
                sessionId: sessionId,
                selectedIndex: selectedIndex
            });

            // 显示结果面板（实际应该从MCP服务器获取结果）
            showResult(selectedIndex === 0);
        });

        // 跳过按钮
        document.getElementById('skip-btn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'skipQuiz',
                sessionId: sessionId
            });
        });

        // 继续按钮
        document.getElementById('next-btn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'showFeedback',
                sessionId: sessionId
            });
        });

        // 查看详情按钮
        document.getElementById('review-btn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'showFeedback',
                sessionId: sessionId
            });
        });

        function showResult(isCorrect) {
            document.getElementById('quiz-panel').style.display = 'none';
            const resultPanel = document.getElementById('result-panel');
            resultPanel.classList.add('show');

            const resultIcon = document.getElementById('result-icon');
            const resultTitle = document.getElementById('result-title');

            if (isCorrect) {
                resultIcon.textContent = '🎉';
                resultTitle.textContent = '回答正确！';
                resultTitle.className = 'result-title result-correct';
            } else {
                resultIcon.textContent = '💪';
                resultTitle.textContent = '回答错误，别灰心！';
                resultTitle.className = 'result-title result-wrong';
            }
        }

        // 接收来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateQuiz':
                    updateQuizContent(message.quizData);
                    break;
            }
        });

        function updateQuizContent(quizData) {
            document.getElementById('question-text').textContent = quizData.question;
            const optionsContainer = document.getElementById('options-container');
            optionsContainer.innerHTML = '';
            
            const letters = ['A', 'B', 'C', 'D'];
            quizData.options.forEach((option, index) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option';
                optionDiv.dataset.index = index;
                optionDiv.innerHTML = 
                    '<span class="option-letter">' + letters[index] + '</span>' +
                    '<span class="option-text">' + option + '</span>';
                optionDiv.addEventListener('click', () => {
                    document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
                    optionDiv.classList.add('selected');
                    selectedIndex = index;
                });
                optionsContainer.appendChild(optionDiv);
            });

            sessionId = quizData.id;
            document.getElementById('session-info').textContent = 'Session ID: ' + sessionId;
            
            // 重置界面
            document.getElementById('quiz-panel').style.display = 'block';
            document.getElementById('result-panel').classList.remove('show');
            selectedIndex = null;
        }
    </script>
</body>
</html>`;
}

export function deactivate() {
    console.log('Live-time Quiz extension is now deactivated!');
}
