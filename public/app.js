const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messagesElement = document.querySelector('#messages');
const sendButton = document.querySelector('#send-button');
const clearButton = document.querySelector('#clear-chat');
const welcomeMessage = document.querySelector('#welcome-message');
const entryScreen = document.querySelector('#entry-screen');
const workspace = document.querySelector('#workspace');
const signinForm = document.querySelector('#signin-form');
const gallerySigninForm = document.querySelector('#gallery-signin-form');
const guestButton = document.querySelector('#guest-button');
const signoutButton = document.querySelector('#signout-button');
const accountLabel = document.querySelector('#account-label');
const chatTab = document.querySelector('#chat-tab');
const galleryTab = document.querySelector('#gallery-tab');
const chatView = document.querySelector('#chat-view');
const galleryView = document.querySelector('#gallery-view');
const galleryLock = document.querySelector('#gallery-lock');
const botGrid = document.querySelector('#bot-grid');
const tabLock = document.querySelector('#tab-lock');
const themeToggle = document.querySelector('#theme-toggle');
const settingsToggle = document.querySelector('#settings-toggle');
const settingsDialog = document.querySelector('#settings-dialog');
const settingsForm = document.querySelector('#settings-form');
const settingsClose = document.querySelector('#settings-close');
const settingsCancel = document.querySelector('#settings-cancel');
const themeSetting = document.querySelector('#setting-theme');
const responseLengthSetting = document.querySelector('#setting-response-length');
const responseStyleSetting = document.querySelector('#setting-response-style');
const voiceSetting = document.querySelector('#setting-voice');
const speechRateSetting = document.querySelector('#setting-speech-rate');
const speechRateValue = document.querySelector('#speech-rate-value');
const autoSpeakSetting = document.querySelector('#setting-auto-speak');
const markdownSetting = document.querySelector('#setting-markdown');
const voiceButton = document.querySelector('#voice-button');
const voiceStatus = document.querySelector('#voice-status');

let conversation = [];
let access = null;
let activeSpeakButton = null;
let microphoneRequestPending = false;
const responseLengths = ['concise', 'balanced', 'detailed'];
const responseStyles = ['friendly', 'professional', "joke", "dumb"];
const speechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let availableVoices = [];

function loadSettings() {
    try {
        const storedSettings = localStorage.getItem('minimax-settings');
        const saved = storedSettings
            ? JSON.parse(storedSettings)
            : { theme: localStorage.getItem('minimax-theme') };
        return {
            theme: saved?.theme === 'dark' ? 'dark' : 'light',
            response_length: responseLengths.includes(saved?.response_length) ? saved.response_length : 'balanced',
            response_style: responseStyles.includes(saved?.response_style) ? saved.response_style : 'friendly',
            voice: typeof saved?.voice === 'string' ? saved.voice : '',
            speech_rate: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3].includes(Number(saved?.speech_rate)) ? Number(saved.speech_rate) : 1,
            auto_speak: saved?.auto_speak === true,
            markdown: saved?.markdown !== false,
        };
    } catch {
        return {
            theme: 'light',
            response_length: 'balanced',
            response_style: 'friendly',
            voice: '',
            speech_rate: 1,
            auto_speak: false,
            markdown: true,
        };
    }
}

let settings = loadSettings();

function saveSettings() {
    localStorage.setItem('minimax-settings', JSON.stringify(settings));
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    settings.theme = theme;
    themeSetting.value = theme;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    themeToggle.title = `Switch to ${nextTheme} mode`;
    saveSettings();
}

responseLengthSetting.value = settings.response_length;
responseStyleSetting.value = settings.response_style;
speechRateSetting.value = String(settings.speech_rate);
speechRateValue.value = `${settings.speech_rate}×`;
autoSpeakSetting.checked = settings.auto_speak;
markdownSetting.checked = settings.markdown;
setTheme(settings.theme);
themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
settingsToggle.addEventListener('click', () => {
    themeSetting.value = settings.theme;
    responseLengthSetting.value = settings.response_length;
    responseStyleSetting.value = settings.response_style;
    voiceSetting.value = settings.voice;
    speechRateSetting.value = String(settings.speech_rate);
    speechRateValue.value = `${settings.speech_rate}×`;
    autoSpeakSetting.checked = settings.auto_speak;
    markdownSetting.checked = settings.markdown;
    settingsDialog.showModal();
});
settingsClose.addEventListener('click', () => settingsDialog.close());
settingsCancel.addEventListener('click', () => settingsDialog.close());
settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    settings.response_length = responseLengthSetting.value;
    settings.response_style = responseStyleSetting.value;
    settings.voice = voiceSetting.value;
    settings.speech_rate = Number(speechRateSetting.value);
    settings.auto_speak = autoSpeakSetting.checked;
    settings.markdown = markdownSetting.checked;
    setTheme(themeSetting.value);
    settingsDialog.close();
});
speechRateSetting.addEventListener('input', () => {
    speechRateValue.value = `${Number(speechRateSetting.value).toFixed(1).replace('.0', '')}×`;
});

function updateVoiceOptions() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices();
    const selectedVoice = settings.voice;
    voiceSetting.replaceChildren(new Option('System default', ''));
    for (const voice of availableVoices) {
        const option = new Option(`${voice.name} (${voice.lang})`, voice.voiceURI);
        voiceSetting.append(option);
    }
    voiceSetting.value = selectedVoice;
    if (voiceSetting.value !== selectedVoice) {
        voiceSetting.value = '';
    }
}

updateVoiceOptions();
if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', updateVoiceOptions);
}

function speakText(text, trigger = null) {
    if (!('speechSynthesis' in window)) {
        voiceStatus.textContent = 'Speech playback is not supported by this browser.';
        return;
    }
    if (trigger && trigger === activeSpeakButton) {
        activeSpeakButton = null;
        trigger.textContent = 'Speak';
        window.speechSynthesis.cancel();
        voiceStatus.textContent = 'Voice playback stopped.';
        return;
    }
    if (activeSpeakButton) activeSpeakButton.textContent = 'Speak';
    activeSpeakButton = null;
    window.speechSynthesis.cancel();
    const spokenText = text
        .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
        .replace(/[*_~#]/g, '')
        .trim();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = settings.speech_rate;
    utterance.voice = availableVoices.find((voice) => voice.voiceURI === settings.voice) || null;
    activeSpeakButton = trigger;
    utterance.onstart = () => {
        if (trigger) trigger.textContent = 'Stop';
    };
    utterance.onend = () => {
        if (trigger) trigger.textContent = 'Speak';
        if (activeSpeakButton === trigger) activeSpeakButton = null;
        voiceStatus.textContent = 'Voice playback finished.';
    };
    utterance.onerror = () => {
        if (trigger) trigger.textContent = 'Speak';
        if (activeSpeakButton === trigger) activeSpeakButton = null;
        voiceStatus.textContent = 'Could not play the spoken reply.';
    };
    voiceStatus.textContent = 'Speaking reply...';
    window.speechSynthesis.speak(utterance);
}

if (speechRecognition) {
    recognition = new speechRecognition();
    recognition.lang = navigator.language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.addEventListener('start', () => {
        voiceButton.classList.add('recording');
        voiceButton.setAttribute('aria-label', 'Stop voice input');
        voiceButton.setAttribute('aria-pressed', 'true');
        voiceButton.title = 'Stop voice input';
        voiceStatus.textContent = 'Listening...';
    });
    recognition.addEventListener('result', (event) => {
        const transcript = Array.from(event.results)
            .slice(event.resultIndex)
            .map((result) => result[0].transcript)
            .join(' ')
            .trim();
        if (transcript) {
            input.value = `${input.value.trim()}${input.value.trim() ? ' ' : ''}${transcript}`;
            resizeInput();
            input.focus();
            voiceStatus.textContent = 'Voice message added. Review it, then send.';
        }
    });
    recognition.addEventListener('error', (event) => {
        const errorMessages = {
            'not-allowed': 'Voice recognition was blocked. Allow microphone access for this site in your browser and Windows settings, then reload.',
            'service-not-allowed': 'The browser speech service denied voice input. Try Chrome or Edge and check your internet connection.',
            'audio-capture': 'No microphone is available. Connect or enable a microphone, then try again.',
            'network': 'The browser speech service could not connect. Check your internet connection and try again.',
            'no-speech': 'No speech was detected. Check your microphone and try again.',
        };
        voiceStatus.textContent = errorMessages[event.error] || `Voice input failed: ${event.error}.`;
    });
    recognition.addEventListener('end', () => {
        voiceButton.classList.remove('recording');
        voiceButton.setAttribute('aria-label', 'Start voice input');
        voiceButton.setAttribute('aria-pressed', 'false');
        voiceButton.title = 'Start voice input';
    });
} else {
    voiceButton.disabled = true;
    voiceButton.title = 'Voice input is not supported by this browser';
    voiceStatus.textContent = 'Voice input is not supported by this browser.';
}

voiceButton.addEventListener('click', () => {
    if (!recognition) return;
    if (voiceButton.classList.contains('recording')) {
        recognition.stop();
    } else {
        startVoiceInput();
    }
});

async function startVoiceInput() {
    if (microphoneRequestPending) return;
    if (location.protocol === 'file:') {
        voiceStatus.textContent = 'Open the app through its local server: run `python min.py`, then visit http://localhost:8080.';
        return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        voiceStatus.textContent = 'Microphone access needs a secure browser context. Open the app at http://localhost:8080.';
        return;
    }

    microphoneRequestPending = true;
    voiceButton.disabled = true;
    voiceStatus.textContent = 'Requesting microphone access...';
    let microphone;
    try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone.getTracks().forEach((track) => track.stop());
        recognition.start();
    } catch (error) {
        if (microphone) {
            microphone.getTracks().forEach((track) => track.stop());
        }
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
            voiceStatus.textContent = 'Microphone permission was blocked. Allow it in this site’s browser settings and Windows microphone privacy settings, then reload.';
        } else if (error instanceof DOMException && error.name === 'NotFoundError') {
            voiceStatus.textContent = 'No microphone was found. Connect or enable one, then try again.';
        } else if (error instanceof DOMException && error.name === 'NotReadableError') {
            voiceStatus.textContent = 'The microphone is busy or unavailable. Close other apps using it and try again.';
        } else if (error instanceof DOMException && error.name === 'InvalidStateError') {
            voiceStatus.textContent = 'Voice input is already starting. Wait a moment and try again.';
        } else {
            voiceStatus.textContent = `Could not start microphone access: ${error instanceof Error ? error.message : 'unknown error'}.`;
        }
    } finally {
        microphoneRequestPending = false;
        voiceButton.disabled = false;
    }
}

function showView(view) {
    const showGallery = view === 'gallery';
    chatView.hidden = showGallery;
    galleryView.hidden = !showGallery;
    chatTab.classList.toggle('active', !showGallery);
    galleryTab.classList.toggle('active', showGallery);

    const signedIn = Boolean(access?.email);
    galleryLock.hidden = signedIn;
    botGrid.hidden = !signedIn;
    tabLock.hidden = signedIn;
}

function enterWorkspace(session, view = 'chat') {
    access = session;
    sessionStorage.setItem('minimax-access', JSON.stringify(session));
    entryScreen.hidden = true;
    workspace.hidden = false;
    accountLabel.textContent = session.email || 'Guest';
    signoutButton.hidden = !session.email;
    showView(view);
}

function leaveWorkspace() {
    access = null;
    sessionStorage.removeItem('minimax-access');
    workspace.hidden = true;
    entryScreen.hidden = false;
    conversation = [];
    messagesElement.replaceChildren(welcomeMessage);
    welcomeMessage.hidden = false;
    showView('chat');
}

try {
    const savedAccess = JSON.parse(sessionStorage.getItem('minimax-access'));
    if (savedAccess?.type === 'guest' || (savedAccess?.type === 'email' && savedAccess.email)) {
        enterWorkspace(savedAccess);
    }
} catch {
    sessionStorage.removeItem('minimax-access');
}

signinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    enterWorkspace({ type: 'email', email: document.querySelector('#email-input').value.trim() });
});

gallerySigninForm.addEventListener('submit', (event) => {
    event.preventDefault();
    enterWorkspace({ type: 'email', email: document.querySelector('#gallery-email').value.trim() }, 'gallery');
});

guestButton.addEventListener('click', () => enterWorkspace({ type: 'guest' }));
signoutButton.addEventListener('click', leaveWorkspace);
chatTab.addEventListener('click', () => showView('chat'));
galleryTab.addEventListener('click', () => showView('gallery'));

function appendInlineMarkdown(parent, text) {
    const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
    let previousIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        parent.append(document.createTextNode(text.slice(previousIndex, match.index)));
        if (match[2] && match[3]) {
            try {
                const url = new URL(match[3]);
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    const link = document.createElement('a');
                    link.href = url.href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = match[2];
                    parent.append(link);
                } else {
                    parent.append(document.createTextNode(match[0]));
                }
            } catch {
                parent.append(document.createTextNode(match[0]));
            }
        } else if (match[4]) {
            const code = document.createElement('code');
            code.textContent = match[4];
            parent.append(code);
        } else {
            const tag = match[5] ? 'strong' : match[6] ? 'del' : 'em';
            const value = match[5] || match[6] || match[7] || match[8];
            const element = document.createElement(tag);
            element.textContent = value;
            parent.append(element);
        }
        previousIndex = pattern.lastIndex;
    }
    parent.append(document.createTextNode(text.slice(previousIndex)));
}

function appendMarkdown(parent, content) {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    const isBlockStart = (line) => /^(#{1,6}\s|```|>\s?|[-*+]\s+|\d+\.\s+|[-*_]{3,}\s*$)/.test(line);
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        if (lines[index].startsWith('```')) {
            index += 1;
            const codeLines = [];
            while (index < lines.length && !lines[index].startsWith('```')) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) index += 1;
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = codeLines.join('\n');
            pre.append(code);
            parent.append(pre);
            continue;
        }
        const heading = lines[index].match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const element = document.createElement(`h${heading[1].length}`);
            appendInlineMarkdown(element, heading[2]);
            parent.append(element);
            index += 1;
            continue;
        }
        if (/^[-*_]{3,}\s*$/.test(lines[index])) {
            parent.append(document.createElement('hr'));
            index += 1;
            continue;
        }
        if (/^>\s?/.test(lines[index])) {
            const quote = document.createElement('blockquote');
            while (index < lines.length && /^>\s?/.test(lines[index])) {
                if (quote.childNodes.length) quote.append(document.createElement('br'));
                appendInlineMarkdown(quote, lines[index].replace(/^>\s?/, ''));
                index += 1;
            }
            parent.append(quote);
            continue;
        }
        const listItem = lines[index].match(/^([-*+]|\d+\.)\s+(.*)$/);
        if (listItem) {
            const ordered = /^\d+\./.test(listItem[1]);
            const list = document.createElement(ordered ? 'ol' : 'ul');
            while (index < lines.length) {
                const item = lines[index].match(/^([-*+]|\d+\.)\s+(.*)$/);
                if (!item || /^\d+\./.test(item[1]) !== ordered) break;
                const element = document.createElement('li');
                appendInlineMarkdown(element, item[2]);
                list.append(element);
                index += 1;
            }
            parent.append(list);
            continue;
        }
        const paragraphLines = [];
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
            paragraphLines.push(lines[index]);
            index += 1;
        }
        if (!paragraphLines.length) {
            paragraphLines.push(lines[index]);
            index += 1;
        }
        const paragraph = document.createElement('p');
        paragraphLines.forEach((line, lineIndex) => {
            if (lineIndex) paragraph.append(document.createElement('br'));
            appendInlineMarkdown(paragraph, line);
        });
        parent.append(paragraph);
    }
}

function addMessage(role, content, { error = false } = {}) {
    const message = document.createElement('div');
    message.className = `message ${role}${error ? ' error' : ''}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (role === 'assistant' && !error && settings.markdown) {
        appendMarkdown(bubble, content);
    } else {
        bubble.textContent = content;
    }
    message.append(bubble);
    if (role === 'assistant' && !error) {
        const speakButton = document.createElement('button');
        speakButton.className = 'message-speak';
        speakButton.type = 'button';
        speakButton.textContent = 'Speak';
        speakButton.setAttribute('aria-label', 'Read this reply aloud');
        speakButton.addEventListener('click', () => speakText(content, speakButton));
        message.append(speakButton);
    }
    messagesElement.append(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
}

function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

async function sendMessage(content) {
    const text = content.trim();
    if (!text || sendButton.disabled) return;

    welcomeMessage.hidden = true;
    conversation.push({ role: 'user', content: text });
    addMessage('user', text);
    input.value = '';
    resizeInput();
    sendButton.disabled = true;

    const typing = document.createElement('div');
    typing.className = 'message typing';
    typing.setAttribute('aria-label', 'MiniMax is responding');
    typing.innerHTML = '<div class="message-bubble"><i></i><i></i><i></i></div>';
    messagesElement.append(typing);
    messagesElement.scrollTop = messagesElement.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversation, settings }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The request failed.');
        if (typeof result.reply !== 'string' || !result.reply.trim()) {
            throw new Error('The AI returned an empty response. Try again.');
        }

        conversation.push({ role: 'assistant', content: result.reply });
        addMessage('assistant', result.reply);
        if (settings.auto_speak) speakText(result.reply);
    } catch (error) {
        conversation.pop();
        const message = error instanceof Error ? error.message : 'Could not reach the chat server. Try again.';
        addMessage('assistant', message, { error: true });
    } finally {
        typing.remove();
        sendButton.disabled = false;
        input.focus();
    }
}

form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
});

input.addEventListener('input', resizeInput);
input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
    }
});

clearButton.addEventListener('click', () => {
    conversation = [];
    messagesElement.replaceChildren(welcomeMessage);
    welcomeMessage.hidden = false;
    input.value = '';
    resizeInput();
    input.focus();
});

document.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => sendMessage(button.textContent));
});

document.querySelectorAll('.bot-action').forEach((button) => {
    button.addEventListener('click', () => {
        showView('chat');
        input.value = button.dataset.prompt;
        resizeInput();
        input.focus();
    });
});