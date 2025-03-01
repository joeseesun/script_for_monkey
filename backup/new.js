// ==UserScript==
// @name         Translate X Post with Gemini (Inline Contrast, Max Compatibility)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Dynamically translate X posts and insert translations below original text for contrast with maximum compatibility
// @author       You
// @match        https://x.com/*
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

console.log('Script loaded and running on:', window.location.href);

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
function setTranslation({ element, text, translatedText }) {
    if (!element || !text || !translatedText) return;
    const contrastContainer = document.createElement('div');
    contrastContainer.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border: 1px solid #ccc;';
    contrastContainer.innerHTML = `
        <div style="margin-bottom: 5px;"><strong>原文:</strong> ${text.replace(/\n/g, '<br>')}</div>
        <div><strong>翻译:</strong> ${translatedText.replace(/\n/g, '<br>')}</div>
    `;
    // 容错插入逻辑
    const parent = element.parentNode;
    if (parent) {
        const nextSibling = element.nextSibling;
        if (nextSibling) {
            parent.insertBefore(contrastContainer, nextSibling);
        } else {
            parent.appendChild(contrastContainer);
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
    const prompt = `将以下文本翻译成简体中文，并只返回翻译结果，不包含任何解释或额外信息：${text}`;
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
        timeout: 10000,
        onload: function(response) {
            console.log('GM.xmlHttpRequest response status:', response.status);
            console.log('Raw response:', response.responseText);
            if (response.status === 200) {
                try {
                    const responseJson = JSON.parse(response.responseText);
                    const translatedText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || 'Translation failed';
                    console.log('Parsed translated text:', translatedText);
                    setTranslation({ element: originalElement, text, translatedText });
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