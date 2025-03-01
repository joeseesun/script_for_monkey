// ==UserScript==
// @name         Translate X Post with Gemini (Inline Translation & Interpretation, Max Compatibility)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Dynamically translate and interpret X posts, inserting results below original text with maximum compatibility
// @author       You
// @match        https://x.com/*
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

console.log('Script loaded and running on:', window.location.href);

// Prompt 模块（便于优化调整）
const PROMPTS = {
    TRANSLATE: `将以下文本翻译成简体中文，并只返回翻译结果，不包含任何解释或额外信息：`,
    INTERPRET: `解读这个帖子：`
};

const API_KEY = 'AIzaSyAedclb2NuWLZBS1Qy3NW9Tf4Lo4xg49Jw'; // 替换为您的实际Gemini API密钥
const MODEL = 'gemini-1.5-flash';
const TARGET_LANGUAGE = 'Chinese';
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

// 测试 GM.xmlHttpRequest 的独立功能
console.log('Testing GM.xmlHttpRequest');
GM.xmlHttpRequest({
    method: 'GET',
    url: 'https://api.ipify.org?format=json', // 公开的测试 API
    onload: function(response) {
        console.log('GM.xmlHttpRequest test response status:', response.status);
        console.log('GM.xmlHttpRequest test response:', response.responseText);
    },
    onerror: function(error) {
        console.error('GM.xmlHttpRequest test error:', error);
    }
});

// 工具函数：提取纯文本，处理嵌套和特殊字符
function getPlainText(element) {
    if (!element) return '';
    return Array.from(element.childNodes)
        .map(node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
            if (node.nodeName === 'SPAN' || node.nodeName === 'DIV' || node.nodeName === 'A') return getPlainText(node);
            return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 工具函数：设置翻译和解读结果到元素
function setTranslationAndInterpretation({ element, text, translatedText, interpretationText }) {
    if (!element || !text || (!translatedText && !interpretationText)) return;

    // 检查是否已插入翻译和解读，避免重复
    const existingContainer = element.nextSibling;
    if (existingContainer && existingContainer.className === 'translation-interpretation-container') {
        console.log('Translation and interpretation already exist, skipping...');
        return;
    }

    const container = document.createElement('div');
    container.className = 'translation-interpretation-container'; // 添加类名便于识别
    container.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border: 1px solid #ccc;';

    let content = '';
    if (translatedText && translatedText !== 'Translation failed') {
        content += `<div style="margin-bottom: 5px;">${translatedText}</div>`;
    }
    if (interpretationText && interpretationText !== 'Interpretation failed') {
        content += `<div style="margin-top: 5px; border-top: 1px solid #ccc; padding-top: 5px;"><strong>解读:</strong> ${interpretationText}</div>`;
    }

    container.innerHTML = content;

    // 容错插入逻辑
    const parent = element.parentNode;
    if (parent) {
        const nextSibling = element.nextSibling;
        if (nextSibling) {
            parent.insertBefore(container, nextSibling);
        } else {
            parent.appendChild(container);
        }
    } else {
        console.warn('No parent node found for translation/interpretation insertion');
    }
}

function getPostElements() {
    return document.querySelectorAll('article[data-testid="tweet"], div[data-testid="tweet"]'); // 扩展选择器，兼容可能的变化
}

function getTweetTextElement(tweetElement) {
    const selectors = [
        'div[data-testid="tweetText"]',
        'div.css-146c3p1.r-bcqeeo.r-1ttztb7',
        'span[data-testid="tweet-text"]',
        'div[data-testid="newTweetText"]'
    ];
    for (const selector of selectors) {
        const textElement = tweetElement.querySelector(selector);
        if (textElement) {
            const text = getPlainText(textElement);
            if (text && (text.match(/[a-zA-Z@]/) || text.length > 5)) { // 宽松验证
                console.log('Found tweet text with selector:', selector, 'Text:', text, 'Element:', textElement);
                return { text, element: textElement };
            }
        }
    }
    return { text: 'No post text found', element: null };
}

function translateText(text, originalElement) {
    console.log('Starting translation for text:', text);
    if (!text || text === 'No post text found') {
        console.warn('No valid text to translate');
        return;
    }

    // 翻译请求
    const translatePrompt = `${PROMPTS.TRANSLATE}${text}`;
    const translateRequestBody = {
        "contents": [{
            "parts": [{
                "text": translatePrompt
            }]
        }]
    };

    console.log('Sending translation GM.xmlHttpRequest to:', API_ENDPOINT, 'with body:', JSON.stringify(translateRequestBody));
    GM.xmlHttpRequest({
        method: 'POST',
        url: `${API_ENDPOINT}?key=${API_KEY}`,
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(translateRequestBody),
        timeout: 10000,
        onload: function(response) {
            console.log('Translation GM.xmlHttpRequest response status:', response.status);
            console.log('Translation raw response:', response.responseText);
            if (response.status === 200) {
                try {
                    const responseJson = JSON.parse(response.responseText);
                    const translatedText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || 'Translation failed';
                    console.log('Parsed translated text:', translatedText);

                    // 解读请求
                    const interpretPrompt = `${PROMPTS.INTERPRET}${text}`;
                    const interpretRequestBody = {
                        "contents": [{
                            "parts": [{
                                "text": interpretPrompt
                            }]
                        }]
                    };

                    console.log('Sending interpretation GM.xmlHttpRequest to:', API_ENDPOINT, 'with body:', JSON.stringify(interpretRequestBody));
                    GM.xmlHttpRequest({
                        method: 'POST',
                        url: `${API_ENDPOINT}?key=${API_KEY}`,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(interpretRequestBody),
                        timeout: 15000, // 增加超时时间到15秒
                        onload: function(interpretationResponse) {
                            console.log('Interpretation GM.xmlHttpRequest response status:', interpretationResponse.status);
                            console.log('Interpretation raw response:', interpretationResponse.responseText);
                            if (interpretationResponse.status === 200) {
                                try {
                                    const interpretationJson = JSON.parse(interpretationResponse.responseText);
                                    const interpretationText = interpretationJson.candidates?.[0]?.content?.parts?.[0]?.text || 'Interpretation failed';
                                    console.log('Parsed interpretation text:', interpretationText);
                                    setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText });
                                } catch (e) {
                                    console.error('Failed to parse interpretation response:', e, 'Raw response:', interpretationResponse.responseText);
                                    setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText: 'Interpretation failed' });
                                }
                            } else {
                                console.error('Interpretation API request failed with status: ' + interpretationResponse.status + ', response: ' + interpretationResponse.responseText);
                                setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText: 'Interpretation failed' });
                            }
                        },
                        onerror: function(error) {
                            console.error('Interpretation GM.xmlHttpRequest error: ', error);
                            setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText: 'Interpretation failed' });
                        },
                        onabort: function() {
                            console.error('Interpretation GM.xmlHttpRequest aborted');
                            setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText: 'Interpretation failed' });
                        },
                        ontimeout: function() {
                            console.error('Interpretation GM.xmlHttpRequest timed out');
                            setTranslationAndInterpretation({ element: originalElement, text, translatedText, interpretationText: 'Interpretation timed out' });
                        }
                    });
                } catch (e) {
                    console.error('Failed to parse translation response:', e, 'Raw response:', response.responseText);
                    setTranslationAndInterpretation({ element: originalElement, text, translatedText: 'Translation failed', interpretationText: 'Interpretation failed' });
                }
            } else {
                console.error('Translation API request failed with status: ' + response.status + ', response: ' + response.responseText);
                setTranslationAndInterpretation({ element: originalElement, text, translatedText: 'Translation failed', interpretationText: 'Interpretation failed' });
            }
        },
        onerror: function(error) {
            console.error('Translation GM.xmlHttpRequest error: ', error);
            setTranslationAndInterpretation({ element: originalElement, text, translatedText: 'Translation failed', interpretationText: 'Interpretation failed' });
        },
        onabort: function() {
            console.error('Translation GM.xmlHttpRequest aborted');
            setTranslationAndInterpretation({ element: originalElement, text, translatedText: 'Translation failed', interpretationText: 'Interpretation failed' });
        },
        ontimeout: function() {
            console.error('Translation GM.xmlHttpRequest timed out');
            setTranslationAndInterpretation({ element: originalElement, text, translatedText: 'Translation failed', interpretationText: 'Interpretation failed' });
        }
    });
    console.log('Translation GM.xmlHttpRequest initiated');
}

// 使用 MutationObserver 监听 DOM 变化
function observeTweets() {
    const targetNode = document.querySelector('main') || document.body; // 更具体的目标
    if (!targetNode) {
        console.warn('No main or body element found, observing document.body');
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.matches('article[data-testid="tweet"]') || node.matches('div[data-testid="tweet"]'))) {
                        processTweet(node);
                    } else if (node.querySelector) {
                        const tweets = node.querySelectorAll('article[data-testid="tweet"], div[data-testid="tweet"]');
                        tweets.forEach(tweet => processTweet(tweet));
                    }
                });
            }
        });
    });

    observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });

    // 初始处理现有帖子
    console.log('Processing existing tweets...');
    getPostElements().forEach(tweet => {
        setTimeout(() => processTweet(tweet), 1000); // 额外延迟1秒处理现有帖子
    });
}

function processTweet(tweetElement, attempt = 0) {
    if (attempt > 3) {
        console.error('Failed to process tweet after 3 retries');
        return;
    }

    const { text, element } = getTweetTextElement(tweetElement);
    console.log('Processing tweet:', text, 'Attempt:', attempt);

    if (text && element && text !== 'No post text found') {
        translateText(text, element);
    } else {
        console.warn('No valid tweet text found, retrying in 1s...', tweetElement);
        setTimeout(() => processTweet(tweetElement, attempt + 1), 1000); // 重试1秒后
    }
}

(function() {
    'use strict';
    console.log('Script starting on:', window.location.href);
    setTimeout(() => {
        console.log('Starting tweet observation after delay, URL:', window.location.href);
        observeTweets();
    }, 3000); // 增加初始延迟到3秒
})();