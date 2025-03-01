// ==UserScript==
// @name         Translate X Post with Gemini (Simplified Inline Translation)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Dynamically translate X posts and insert Chinese translations below original text with maximum compatibility
// @author       You
// @match        https://x.com/*
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

console.log('Script loaded and running on:', window.location.href);

// 样式配置（便于修改）
const STYLES = {
    TRANSLATION_CONTAINER: {
        margin: '10px 0',
        padding: '10px',
        backgroundColor: '#f0f0f0',
        border: '2px solid #ccc',
        borderRadius: '8px', // 圆弧
        fontFamily: 'Arial, sans-serif', // 字体
        fontSize: '16px', // 字号
        lineHeight: '1.5', // 行高
        color: '#000000' // 字体颜色
    }
};

// Prompt 配置（便于优化调整）
const PROMPT = `将以下文本翻译成简体中文，并只返回翻译结果，不包含任何解释或额外信息：`;

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

// 工具函数：设置翻译结果到元素
function setTranslation({ element, translatedText }) {
    if (!element || !translatedText || translatedText === 'Translation failed') return;

    // 检查是否已插入翻译，避免重复
    const existingTranslation = element.nextSibling;
    if (existingTranslation && existingTranslation.className === 'translation-container') {
        console.log('Translation already exists, skipping...');
        return;
    }

    const translationContainer = document.createElement('div');
    translationContainer.className = 'translation-container'; // 添加类名便于识别
    translationContainer.style.cssText = `
        margin: ${STYLES.TRANSLATION_CONTAINER.margin};
        padding: ${STYLES.TRANSLATION_CONTAINER.padding};
        background-color: ${STYLES.TRANSLATION_CONTAINER.backgroundColor};
        border: ${STYLES.TRANSLATION_CONTAINER.border};
        border-radius: ${STYLES.TRANSLATION_CONTAINER.borderRadius};
        font-family: ${STYLES.TRANSLATION_CONTAINER.fontFamily};
        font-size: ${STYLES.TRANSLATION_CONTAINER.fontSize};
        line-height: ${STYLES.TRANSLATION_CONTAINER.lineHeight};
        color: ${STYLES.TRANSLATION_CONTAINER.color};
    `;
    translationContainer.textContent = translatedText; // 只显示中文翻译，无标题

    // 容错插入逻辑
    const parent = element.parentNode;
    if (parent) {
        const nextSibling = element.nextSibling;
        if (nextSibling) {
            parent.insertBefore(translationContainer, nextSibling);
        } else {
            parent.appendChild(translationContainer);
        }
    } else {
        console.warn('No parent node found for translation insertion');
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

    const prompt = `${PROMPT}${text}`;
    const requestBody = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    };

    console.log('Sending GM.xmlHttpRequest to:', API_ENDPOINT, 'with body:', JSON.stringify(requestBody));
    GM.xmlHttpRequest({
        method: 'POST',
        url: `${API_ENDPOINT}?key=${API_KEY}`,
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(requestBody),
        timeout: 10000, // 保持10秒超时，优化性能
        onload: function(response) {
            console.log('GM.xmlHttpRequest response status:', response.status);
            console.log('Raw response:', response.responseText);
            if (response.status === 200) {
                try {
                    const responseJson = JSON.parse(response.responseText);
                    const translatedText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || 'Translation failed';
                    console.log('Parsed translated text:', translatedText);
                    setTranslation({ element: originalElement, translatedText });
                } catch (e) {
                    console.error('Failed to parse response:', e, 'Raw response:', response.responseText);
                }
            } else {
                console.error('API request failed with status: ' + response.status + ', response: ' + response.responseText);
            }
        },
        onerror: function(error) {
            console.error('GM.xmlHttpRequest error: ', error);
        },
        onabort: function() {
            console.error('GM.xmlHttpRequest aborted');
        },
        ontimeout: function() {
            console.error('GM.xmlHttpRequest timed out');
        }
    });
    console.log('GM.xmlHttpRequest initiated');
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
        subtree: true
    }); // 移除 attributes 和 characterData，减少性能开销

    // 初始处理现有帖子
    console.log('Processing existing tweets...');
    getPostElements().forEach(tweet => {
        setTimeout(() => processTweet(tweet), 500); // 减少延迟到0.5秒，优化加载速度
    });
}

function processTweet(tweetElement, attempt = 0) {
    if (attempt > 2) { // 减少重试次数到2次，优化性能
        console.error('Failed to process tweet after 2 retries');
        return;
    }

    const { text, element } = getTweetTextElement(tweetElement);
    console.log('Processing tweet:', text, 'Attempt:', attempt);

    if (text && element && text !== 'No post text found') {
        translateText(text, element);
    } else {
        console.warn('No valid tweet text found, retrying in 0.5s...', tweetElement);
        setTimeout(() => processTweet(tweetElement, attempt + 1), 500); // 减少重试延迟到0.5秒
    }
}

(function() {
    'use strict';
    console.log('Script starting on:', window.location.href);
    setTimeout(() => {
        console.log('Starting tweet observation after delay, URL:', window.location.href);
        observeTweets();
    }, 1000); // 减少初始延迟到1秒，优化加载速度
})();