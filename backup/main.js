// ==UserScript==
// @name         Translate X Post with Gemini
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Translate the current X post or list of posts using the Gemini API
// @author       You
// @match        https://x.com/*
// @grant        GM.xmlhttpRequest
// ==/UserScript==

var API_KEY = 'AIzaSyAedclb2NuWLZBS1Qy3NW9Tf4Lo4xg49Jw'; // 替换为您的实际Gemini API密钥
var MODEL = 'gemini-1.5-pro';
var TARGET_LANGUAGE = 'Chinese';

function getPostText() {
    var postTextElement = document.querySelector('.tweet-text');
    if (postTextElement) {
        return postTextElement.textContent;
    } else {
        return 'No post text found';
    }
}

function getPostTexts() {
    var posts = document.querySelectorAll('.tweet');
    var texts = [];
    posts.forEach(function(post) {
        var textElement = post.querySelector('.tweet-text');
        if (textElement) {
            texts.push(textElement.textContent);
        }
    });
    return texts;
}

function translateText(text) {
    var prompt = `Translate this text to ${TARGET_LANGUAGE}: ${text}`;

    var requestBody = {
        model: MODEL,
        prompt: {
            text: prompt
        }
    };

    var url = 'https://generativelangapi.google.com/v1beta/gemini:generateContent';

    GM.xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: {
            'Authorization': 'Bearer ' + API_KEY,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(requestBody),
        onload: function(response) {
            if (response.status == 200) {
                var responseJson = JSON.parse(response.response);
                var translatedText = responseJson.candidates[0].output.text;
                // Display the translated text
                var translatedElement = document.createElement('div');
                translatedElement.innerHTML = translatedText;
                document.body.appendChild(translatedElement);
            } else {
                console.error('API request failed with status: ' + response.status);
            }
        }
    });
}

(function() {
    if (window.location.href.includes('/status/')) {
        var postText = getPostText();
        translateText(postText);
    } else {
        var postTexts = getPostTexts();
        postTexts.forEach(function(text) {
            translateText(text);
        });
    }
})();