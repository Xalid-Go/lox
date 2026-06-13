import { io } from 'socket.io-client';
import Hls from 'hls.js';
import './style.css';

// Development vs Production Socket.IO Connection URL
const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : window.location.origin;

const socket = io(socketUrl);

// Application State
let myNickname = '';
let myRoomCode = '';
let isHost = false;
let hlsInstance = null;
let isSyncing = false; // Flag to prevent infinite loops
let currentVideoType = 'none'; // 'hls', 'mp4', 'iframe'
let fetchedMovies = [];
let typingTimeout = null;
let lastTypingTime = 0;
const typingUsers = new Map(); // Key: socketId, Value: nickname

// Avatar Gradients Palette
const avatarGradients = [
  'linear-gradient(135deg, #4f46e5, #7c3aed)', // Indigo Purple
  'linear-gradient(135deg, #10b981, #059669)', // Emerald
  'linear-gradient(135deg, #2563eb, #1d4ed8)', // Blue
  'linear-gradient(135deg, #f59e0b, #d97706)', // Amber
  'linear-gradient(135deg, #ec4899, #c026d3)', // Pink-Magenta
  'linear-gradient(135deg, #ef4444, #b91c1c)'  // Red
];

// Hash code to avatar gradient index helper
function getAvatarGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % avatarGradients.length;
  return avatarGradients[idx];
}

// Generate Slack-style Avatar initials
function generateAvatarHtml(nickname) {
  const cleanName = nickname.trim();
  const initials = cleanName.substring(0, 2).toUpperCase();
  const gradient = getAvatarGradient(cleanName);
  return `<span class="user-avatar" style="background: ${gradient}; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 0.75rem; font-weight: bold; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.3);" title="${cleanName}">${initials}</span>`;
}

// DOM Elements
const globalHeader = document.getElementById('global-header');
const headerLogo = document.getElementById('header-logo');
const btnNavAdmin = document.getElementById('btn-nav-admin');

const landingScreen = document.getElementById('landing-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen');
const adminScreen = document.getElementById('admin-screen');
const btnStartApp = document.getElementById('btn-start-app');

// Lobby Elements
const catalogGrid = document.getElementById('catalog-grid');
const btnTriggerCreate = document.getElementById('btn-trigger-create');
const btnTriggerJoin = document.getElementById('btn-trigger-join');

// Modals
const modalCreateRoom = document.getElementById('modal-create-room');
const modalJoinRoom = document.getElementById('modal-join-room');
const btnCloseCreateModal = document.getElementById('close-create-modal');
const btnCloseJoinModal = document.getElementById('close-join-modal');
const btnModalCreate = document.getElementById('btn-modal-create');
const btnModalJoin = document.getElementById('btn-modal-join');
const modalNicknameCreate = document.getElementById('modal-nickname-create');
const modalNicknameJoin = document.getElementById('modal-nickname-join');
const modalCodeJoin = document.getElementById('modal-code-join');

const displayRoomCode = document.getElementById('display-room-code');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const logoBackToLobby = document.getElementById('logo-back-to-lobby');

// Custom Player Elements
const playerWrapper = document.getElementById('player-wrapper');
const html5PlayerContainer = document.getElementById('html5-player-container');
const iframePlayerContainer = document.getElementById('iframe-player-container');
const videoElement = document.getElementById('video-element');
const iframeVideoElement = document.getElementById('iframe-video-element');
const subtitlesTrack = document.getElementById('subtitles-track');
const reactionsOverlay = document.getElementById('reactions-overlay');
const bigPlayOverlay = document.getElementById('big-play-overlay');

// Custom controls bar
const customControls = document.getElementById('custom-controls');
const customProgressContainer = document.getElementById('custom-progress-container');
const customProgressBuffer = document.getElementById('custom-progress-buffer');
const customProgressCurrent = document.getElementById('custom-progress-current');
const customProgressHandle = document.getElementById('custom-progress-handle');

const customPlayBtn = document.getElementById('custom-play-btn');
const customTimeDisplay = document.getElementById('custom-time-display');

const customAudioWrapper = document.getElementById('custom-audio-wrapper');
const customAudioBtn = document.getElementById('custom-audio-btn');
const customAudioDropdown = document.getElementById('custom-audio-dropdown');

const customSpeedBtn = document.getElementById('custom-speed-btn');
const customSpeedDropdown = document.getElementById('custom-speed-dropdown');
const speedLabel = document.getElementById('speed-label');

const customSubsBtn = document.getElementById('custom-subs-btn');

const customVolumeBtn = document.getElementById('custom-volume-btn');
const customVolumeSliderContainer = document.getElementById('custom-volume-slider-container');
const customVolumeSliderCurrent = document.getElementById('custom-volume-slider-current');
const customVolumeSliderHandle = document.getElementById('custom-volume-slider-handle');

const customFullscreenBtn = document.getElementById('custom-fullscreen-btn');

// Video details
const currentMovieTitle = document.getElementById('current-movie-title');
const playerTypeBadge = document.getElementById('player-type-badge');
const videoChangeForm = document.getElementById('video-change-form');
const videoUrlInput = document.getElementById('video-url-input');
const videoTitleInput = document.getElementById('video-title-input');
const btnLoadVideo = document.getElementById('btn-load-video');

const subtitlesFileInput = document.getElementById('subtitles-file-input');
const subtitlesFilename = document.getElementById('subtitles-filename');

// Chat Elements
const chatColumn = document.getElementById('chat-column');
const chatMessages = document.getElementById('chat-messages');
const chatInputForm = document.getElementById('chat-input-form');
const chatMessageInput = document.getElementById('chat-message-input');
const typingIndicator = document.getElementById('typing-indicator');
const userCountDisplay = document.getElementById('user-count');
const roomUsersList = document.getElementById('room-users-list');

// Admin Elements
const logoAdminBackToLobby = document.getElementById('logo-admin-back-to-lobby');
const btnAdminLogout = document.getElementById('btn-admin-logout');
const adminLoginContainer = document.getElementById('admin-login-container');
const adminDashboardContainer = document.getElementById('admin-dashboard-container');
const adminUsernameInput = document.getElementById('admin-username-input');
const adminPasswordInput = document.getElementById('admin-password-input');
const btnAdminLogin = document.getElementById('btn-admin-login');

const statRoomsCount = document.getElementById('stat-rooms-count');
const statUsersCount = document.getElementById('stat-users-count');
const statCatalogCount = document.getElementById('stat-catalog-count');

const adminRoomsTbody = document.getElementById('admin-rooms-tbody');
const adminCatalogTbody = document.getElementById('admin-catalog-tbody');

const adminAddMovieForm = document.getElementById('admin-add-movie-form');
const newMovieTitle = document.getElementById('new-movie-title');
const newMovieRating = document.getElementById('new-movie-rating');
const newMovieType = document.getElementById('new-movie-type');
const newMovieUrl = document.getElementById('new-movie-url');
const newMoviePoster = document.getElementById('new-movie-poster');
const newMovieDesc = document.getElementById('new-movie-desc');

const adminSettingsForm = document.getElementById('admin-settings-form');
const settingsUsernameInput = document.getElementById('settings-username-input');
const settingsPasswordInput = document.getElementById('settings-password-input');

// ==========================================
// Toast System
// ==========================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'error' ? '<i class="fa-solid fa-circle-exclamation" style="margin-right: 8px;"></i>' : '<i class="fa-solid fa-circle-check" style="margin-right: 8px;"></i>';
  toast.innerHTML = `${icon} <span>${message}</span>`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => { toast.remove(); }, 400);
  }, 3000);
}

// ==========================================
// 1. Initialization and Lobby Setup
// ==========================================

async function init() {
  await fetchCatalog();
  checkUrlHash();
  checkUrlParams();
  setupEventListeners();
}

// Fetch catalog from Server DB
async function fetchCatalog() {
  try {
    const res = await fetch(`${socketUrl}/api/admin/catalog`);
    if (res.ok) {
      fetchedMovies = await res.json();
      renderCatalog(fetchedMovies);
    } else {
      console.error('Failed to fetch catalog.');
    }
  } catch (error) {
    console.error('Error fetching catalog:', error);
  }
}

// Render movie catalog grid (with CSS poster fallback on load error)
function renderCatalog(movies) {
  catalogGrid.innerHTML = '';
  if (movies.length === 0) {
    catalogGrid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; font-size: 0.9rem;">Каталог пуст. Добавьте фильмы в панели администратора.</p>';
    return;
  }
  
  movies.forEach((movie) => {
    const card = document.createElement('article');
    card.className = 'movie-card glass';
    
    // Poster Wrap container
    const posterWrap = document.createElement('div');
    posterWrap.className = 'movie-poster-wrap';
    
    const img = document.createElement('img');
    img.className = 'movie-poster';
    img.src = movie.poster || '';
    img.alt = movie.title;
    img.loading = 'lazy';
    
    // Fallback if image fails to load
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement('div');
      fallback.className = 'poster-fallback';
      fallback.style.position = 'absolute';
      fallback.style.top = '0'; fallback.style.left = '0'; fallback.style.width = '100%'; fallback.style.height = '100%';
      fallback.style.display = 'flex'; fallback.style.flexDirection = 'column'; fallback.style.alignItems = 'center'; fallback.style.justifyContent = 'center';
      fallback.innerHTML = `
        <i class="fa-solid fa-film" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 10px;"></i>
        <span style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 0 10px;">${movie.title}</span>
      `;
      posterWrap.appendChild(fallback);
    };
    
    posterWrap.appendChild(img);
    card.appendChild(posterWrap);
    
    // Details wrap
    const details = document.createElement('div');
    details.className = 'movie-details';
    details.innerHTML = `
      <h4>${movie.title}</h4>
      <div class="movie-meta-row">
        <span class="badge">${movie.type}</span>
        <span class="movie-rating"><i class="fa-solid fa-star" style="color: #fbbf24; margin-right: 3px;"></i> ${movie.rating || '0.0'}</span>
      </div>
    `;
    card.appendChild(details);

    card.addEventListener('click', () => {
      // Auto fill new room movie and open modal
      openModal(modalCreateRoom);
      // Wait, we need to pass this state. Let's just focus the create room modal.
      // And we need to pre-fill the host dashboard if they create a room
      localStorage.setItem('lox_selected_movie_url', movie.url);
      localStorage.setItem('lox_selected_movie_title', movie.title);
      localStorage.setItem('lox_selected_movie_type', movie.type);
    });

    catalogGrid.appendChild(card);
  });
}

// ==========================================
// Global Movie Search Logic
// ==========================================
let searchTimeout = null;

async function performGlobalSearch() {
  const inputEl = document.getElementById('global-search-input');
  if (!inputEl) return;
  
  const query = inputEl.value.trim();
  const resultsGrid = document.getElementById('global-search-results');
  if (!resultsGrid) return;
  
  if (!query || query.length < 2) {
    resultsGrid.innerHTML = '';
    return;
  }
  
  resultsGrid.innerHTML = '<div class="search-loading"><i class="fa-solid fa-spinner fa-spin"></i> Поиск в базе IMDB...</div>';
  
  try {
    const res = await fetch(`${socketUrl}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (!data.d || data.d.length === 0) {
      resultsGrid.innerHTML = '<div class="search-loading">Ничего не найдено. Попробуйте написать оригинальное название (на англ).</div>';
      return;
    }
    
    resultsGrid.innerHTML = '';
    
    data.d.forEach(item => {
      if (!item.q && !item.id.startsWith('tt')) return; // Ensure it's a title, not a person
      
      const card = document.createElement('div');
      card.className = 'search-movie-card';
      
      const posterUrl = item.i && item.i.imageUrl ? item.i.imageUrl : '';
      
      card.innerHTML = `
        <img class="search-movie-poster" src="${posterUrl}" onerror="this.src='';this.style.background='#222';">
        <div class="search-movie-info">
          <div class="search-movie-title">${item.l}</div>
          <div class="search-movie-year">${item.y || 'Н/Д'} • IMDB</div>
        </div>
      `;
      
      card.addEventListener('click', () => {
        const imdbId = item.id;
        // Using vidsrc.to which accepts IMDB IDs directly and embeds the video player
        const embedUrl = `https://vidsrc.to/embed/movie/${imdbId}`;
        
        localStorage.setItem('lox_selected_movie_url', embedUrl);
        localStorage.setItem('lox_selected_movie_title', item.l);
        localStorage.setItem('lox_selected_movie_type', 'iframe');
        
        openModal(document.getElementById('modal-create-room'));
      });
      
      resultsGrid.appendChild(card);
    });
    
  } catch (err) {
    console.error(err);
    resultsGrid.innerHTML = '<div class="search-loading" style="color: var(--danger);">Ошибка соединения.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('global-search-input');
  const searchBtn = document.getElementById('btn-global-search');
  
  if (searchInput && searchBtn) {
    searchBtn.addEventListener('click', performGlobalSearch);
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        performGlobalSearch();
      } else {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performGlobalSearch, 600);
      }
    });
  }
});

// Auto-fill room code from query params
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  if (roomCode && roomCode.length === 5) {
    modalCodeJoin.value = roomCode;
    
    // Bypass landing page and show lobby immediately if there is a room code
    landingScreen.classList.remove('active');
    landingScreen.style.display = 'none';
    showScreen('lobby-screen');
    
    // Open join modal
    openModal(modalJoinRoom);
  }
}

function checkUrlHash() {
  if (window.location.hash === '#admin') {
    showScreen('admin-screen');
    globalHeader.style.display = 'none';
    checkAdminAuth();
  } else {
    if (adminScreen.classList.contains('active')) {
      showScreen('lobby-screen');
      globalHeader.style.display = 'block';
    }
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
    screen.style.display = 'none';
  });

  const activeScreen = document.getElementById(screenId);
  activeScreen.style.display = 'flex';
  
  if (screenId === 'room-screen' || screenId === 'admin-screen') {
    globalHeader.style.display = 'none';
  } else {
    globalHeader.style.display = 'block';
  }

  setTimeout(() => { activeScreen.classList.add('active'); }, 50);
}

const savedNickname = localStorage.getItem('lox_nickname');
if (savedNickname) {
  modalNicknameCreate.value = savedNickname;
  modalNicknameJoin.value = savedNickname;
}

// ==========================================
// Modals Logic
// ==========================================

function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// ==========================================
// 2. Custom Video Player logic
// ==========================================

function detectVideoType(url) {
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mp4')) return 'mp4';
  return 'iframe';
}

function loadVideoSource(url, type, title, startPlaying = false) {
  destroyVideo();
  currentVideoType = type;
  currentMovieTitle.innerText = title || 'Пользовательское видео';
  playerTypeBadge.innerText = type === 'hls' ? 'HLS' : type === 'mp4' ? 'MP4' : 'Iframe';
  
  subtitlesFilename.innerText = 'Субтитры не загружены';
  subtitlesTrack.src = '';

  customAudioWrapper.style.display = 'none';

  if (type === 'hls') {
    html5PlayerContainer.classList.add('active');
    iframePlayerContainer.classList.remove('active');
    
    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        maxMaxBufferLength: 10,
        enableWorker: true
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoElement);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startPlaying) videoElement.play().catch(() => {});
        setupAudioTracks();
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = url;
      videoElement.addEventListener('loadedmetadata', () => {
        if (startPlaying) videoElement.play().catch(() => {});
      });
    }
  } else if (type === 'mp4') {
    html5PlayerContainer.classList.add('active');
    iframePlayerContainer.classList.remove('active');
    videoElement.src = url;
    videoElement.load();
    if (startPlaying) {
      videoElement.addEventListener('canplay', function onCanPlay() {
        videoElement.play().catch(() => {});
        videoElement.removeEventListener('canplay', onCanPlay);
      });
    }
  } else if (type === 'iframe') {
    html5PlayerContainer.classList.remove('active');
    iframePlayerContainer.classList.add('active');
    
    let embedUrl = url;
    if (url.includes('youtube.com/watch?v=')) {
      embedUrl = url.replace('watch?v=', 'embed/');
    }
    iframeVideoElement.src = embedUrl;
  }

  speedLabel.innerText = '1.0x';
  document.querySelectorAll('.speed-opt').forEach(opt => {
    opt.classList.remove('active');
    if (opt.getAttribute('data-speed') === '1') opt.classList.add('active');
  });
}

function destroyVideo() {
  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();
  
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  
  iframeVideoElement.src = '';
  currentVideoType = 'none';
  customAudioDropdown.innerHTML = '';
  customAudioWrapper.style.display = 'none';
}

function srtToVtt(srtText) {
  let vttText = 'WEBVTT\n\n';
  vttText += srtText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vttText;
}

function loadSubtitlesFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    let content = e.target.result;
    if (file.name.endsWith('.srt')) {
      content = srtToVtt(content);
    }
    const blob = new Blob([content], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    
    subtitlesTrack.src = url;
    subtitlesTrack.mode = 'showing';
    videoElement.textTracks[0].mode = 'showing';
    subtitlesFilename.innerText = `Загружено: ${file.name}`;
    
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    const dataUrl = `data:text/vtt;base64,${base64Content}`;
    
    if (isHost) {
      socket.emit('change-subtitles', { subtitlesUrl: dataUrl });
    }
  };
  reader.readAsText(file);
}

function setupAudioTracks() {
  if (!hlsInstance) return;
  const tracks = hlsInstance.audioTracks;
  if (tracks.length > 1) {
    customAudioWrapper.style.display = 'inline-flex';
    customAudioDropdown.innerHTML = '';
    
    tracks.forEach((track, index) => {
      const btn = document.createElement('button');
      btn.className = `audio-opt${index === hlsInstance.audioTrack ? ' active' : ''}`;
      btn.innerText = track.name || `Дорожка ${index + 1}`;
      btn.setAttribute('data-track-index', index);
      btn.style.cssText = 'background: transparent; border: none; color: #fff; padding: 8px 12px; text-align: left; cursor: pointer; border-radius: 4px;';
      
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });

      btn.addEventListener('click', () => {
        hlsInstance.audioTrack = index;
        document.querySelectorAll('.audio-opt').forEach(opt => opt.style.color = '#fff');
        btn.style.color = 'var(--primary)';
        customAudioWrapper.classList.remove('open');
      });
      
      customAudioDropdown.appendChild(btn);
    });
  }
}

function formatTimeText(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function updateTimelineProgress() {
  const duration = videoElement.duration;
  const current = videoElement.currentTime;
  
  if (duration) {
    const percentage = (current / duration) * 100;
    customProgressCurrent.style.width = `${percentage}%`;
    customProgressHandle.style.left = `${percentage}%`;
    
    if (videoElement.buffered.length > 0) {
      const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
      const bufferPercent = (bufferedEnd / duration) * 100;
      customProgressBuffer.style.width = `${bufferPercent}%`;
    }
    
    customTimeDisplay.innerText = `${formatTimeText(current)} / ${formatTimeText(duration)}`;
  }
}

function handleTimelineClick(e) {
  const duration = videoElement.duration;
  if (!duration || currentVideoType === 'iframe') return;
  
  const rect = customProgressContainer.getBoundingClientRect();
  const clickedX = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, clickedX / rect.width));
  
  isSyncing = true;
  videoElement.currentTime = percentage * duration;
  
  if (isHost) {
    socket.emit('seek-video', { currentTime: videoElement.currentTime });
  }
  
  setTimeout(() => { isSyncing = false; }, 200);
}

let isMuted = false;
let savedVolume = 1;

function setPlayerVolume(volume) {
  videoElement.volume = volume;
  const percentage = volume * 100;
  
  // Create a slider progress fill using linear-gradient
  const sliderInput = customVolumeSliderContainer.querySelector('input');
  sliderInput.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, rgba(255,255,255,0.2) ${percentage}%, rgba(255,255,255,0.2) 100%)`;
  
  const icon = customVolumeBtn.querySelector('i');
  icon.className = 'fa-solid';
  if (volume === 0) {
    icon.classList.add('fa-volume-xmark');
  } else if (volume < 0.4) {
    icon.classList.add('fa-volume-low');
  } else {
    icon.classList.add('fa-volume-high');
  }
}

function toggleMute() {
  if (isMuted) {
    setPlayerVolume(savedVolume);
    isMuted = false;
  } else {
    savedVolume = videoElement.volume;
    setPlayerVolume(0);
    isMuted = true;
  }
}

function showBigPlayOverlay(isPlay) {
  const icon = bigPlayOverlay.querySelector('i');
  icon.className = isPlay ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  bigPlayOverlay.classList.add('trigger');
  setTimeout(() => {
    bigPlayOverlay.classList.remove('trigger');
  }, 500);
}

let controlsHideTimeout = null;

function resetControlsHideTimer() {
  customControls.style.opacity = '1';
  customControls.style.transform = 'translateY(0)';
  playerWrapper.style.cursor = 'default';
  
  if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
  
  const menusOpen = document.querySelector('.control-menu-wrapper.open');
  if (!videoElement.paused && !menusOpen) {
    controlsHideTimeout = setTimeout(() => {
      customControls.style.opacity = '0';
      customControls.style.transform = 'translateY(10px)';
      playerWrapper.style.cursor = 'none';
    }, 3000);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    playerWrapper.requestFullscreen().catch((err) => {
      console.error('Error enabling fullscreen:', err);
    });
    customFullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
  } else {
    document.exitFullscreen();
    customFullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
  }
}

// ==========================================
// 3. Emoji Reactions
// ==========================================

function animateEmoji(emoji) {
  const particle = document.createElement('span');
  particle.className = 'emoji-particle';
  particle.innerText = emoji;
  
  const leftPos = (Math.random() * 60 + 20) + '%';
  particle.style.left = leftPos;
  
  const duration = (Math.random() * 1.5 + 2) + 's';
  particle.style.animationDuration = duration;
  
  reactionsOverlay.appendChild(particle);
  
  setTimeout(() => {
    particle.remove();
  }, 3500);
}

// ==========================================
// 4. Chat System Messages rendering
// ==========================================

function addChatMessage(sender, text, isSelf = false, isSystem = false) {
  const messageElement = document.createElement('div');
  messageElement.className = `chat-message${isSelf ? ' self' : ''}${isSystem ? ' system' : ''}`;
  
  if (isSystem) {
    messageElement.innerHTML = `<div class="msg-bubble">${text}</div>`;
  } else {
    const avatarHtml = generateAvatarHtml(sender);
    messageElement.innerHTML = `
      <span class="msg-sender">${avatarHtml} <span>${sender}</span></span>
      <div class="msg-bubble">${text}</div>
    `;
  }
  
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateTypingStatus() {
  if (chatMessageInput.value.trim() === '') {
    sendTypingStatus(false);
    return;
  }
  
  sendTypingStatus(true);
  
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    sendTypingStatus(false);
  }, 2000);
}

function sendTypingStatus(isTyping) {
  const time = Date.now();
  if (isTyping && time - lastTypingTime < 1000) return;
  
  if (isTyping) lastTypingTime = time;
  socket.emit('typing-status', { isTyping });
}

function renderTypingIndicator() {
  const names = Array.from(typingUsers.values());
  if (names.length === 0) {
    typingIndicator.style.display = 'none';
    typingIndicator.innerText = '';
  } else if (names.length === 1) {
    typingIndicator.style.display = 'block';
    typingIndicator.innerText = `${names[0]} печатает...`;
  } else {
    typingIndicator.style.display = 'block';
    typingIndicator.innerText = `${names.slice(0, 3).join(', ')} печатают...`;
  }
}

// ==========================================
// 5. Socket.IO Communication Event Handlers
// ==========================================

function setupSocketEvents() {
  socket.on('room-created', ({ roomCode, videoState, users }) => {
    myRoomCode = roomCode;
    isHost = true;
    
    displayRoomCode.innerText = roomCode;
    updateUsersList(users);
    
    videoChangeForm.style.display = 'block';
    
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    showScreen('room-screen');
    showToast(`Комната создана! Код: ${roomCode}`, 'success');
    addChatMessage('Система', 'Вы создали комнату совместного просмотра. Поделитесь кодом с друзьями!', false, true);

    // If auto-load movie is in local storage
    const movieUrl = localStorage.getItem('lox_selected_movie_url');
    if (movieUrl) {
      videoUrlInput.value = movieUrl;
      videoTitleInput.value = localStorage.getItem('lox_selected_movie_title');
      btnLoadVideo.click();
      
      localStorage.removeItem('lox_selected_movie_url');
      localStorage.removeItem('lox_selected_movie_title');
      localStorage.removeItem('lox_selected_movie_type');
    }
  });

  socket.on('room-joined', ({ roomCode, videoState, users }) => {
    myRoomCode = roomCode;
    isHost = false;
    
    displayRoomCode.innerText = roomCode;
    updateUsersList(users);
    
    videoChangeForm.style.display = 'none';

    if (videoState && videoState.url) {
      loadVideoSource(videoState.url, videoState.type, videoState.title, false);
      
      setTimeout(() => {
        socket.emit('request-sync');
      }, 1500);
    }

    showScreen('room-screen');
    showToast(`Успешный вход в комнату ${roomCode}`, 'success');
  });

  socket.on('join-error', ({ message }) => {
    showToast(`Ошибка: ${message}`, 'error');
  });

  socket.on('user-joined', ({ id, nickname, users }) => {
    updateUsersList(users);
  });

  socket.on('user-left', ({ id, nickname, users }) => {
    updateUsersList(users);
    typingUsers.delete(id);
    renderTypingIndicator();
  });

  socket.on('host-changed', ({ hostId, hostNickname, users }) => {
    updateUsersList(users);
    if (socket.id === hostId) {
      isHost = true;
      videoChangeForm.style.display = 'block';
      addChatMessage('Система', 'Предыдущий хост отключился. Теперь вы являетесь хостом комнаты.', false, true);
    }
  });

  socket.on('play-video', ({ currentTime }) => {
    if (currentVideoType === 'iframe') return;
    
    isSyncing = true;
    videoElement.currentTime = currentTime;
    videoElement.play().then(() => {
      isSyncing = false;
      showBigPlayOverlay(true);
      customPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      playerWrapper.classList.remove('paused');
    }).catch(() => {
      isSyncing = false;
    });
  });

  socket.on('pause-video', ({ currentTime }) => {
    if (currentVideoType === 'iframe') return;

    isSyncing = true;
    videoElement.currentTime = currentTime;
    videoElement.pause();
    isSyncing = false;
    showBigPlayOverlay(false);
    customPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    playerWrapper.classList.add('paused');
  });

  socket.on('seek-video', ({ currentTime }) => {
    if (currentVideoType === 'iframe') return;

    isSyncing = true;
    videoElement.currentTime = currentTime;
    setTimeout(() => { isSyncing = false; }, 200);
  });

  socket.on('change-video', ({ url, type, title }) => {
    loadVideoSource(url, type, title, false);
    showToast(`Включено: ${title}`);
  });

  socket.on('change-subtitles', ({ subtitlesUrl }) => {
    subtitlesTrack.src = subtitlesUrl;
    subtitlesTrack.mode = 'showing';
    videoElement.textTracks[0].mode = 'showing';
    subtitlesFilename.innerText = 'Загружены субтитры от хоста';
    showToast('Субтитры обновлены');
  });

  socket.on('change-speed', ({ speed }) => {
    if (currentVideoType === 'iframe') return;
    
    isSyncing = true;
    videoElement.playbackRate = speed;
    speedLabel.innerText = `${speed}x`;
    
    document.querySelectorAll('.speed-opt').forEach(opt => {
      opt.classList.remove('active');
      if (parseFloat(opt.getAttribute('data-speed')) === speed) opt.classList.add('active');
    });
    
    setTimeout(() => { isSyncing = false; }, 200);
  });

  socket.on('chat-message', ({ sender, text, isSystem, socketId }) => {
    const isSelf = socketId === socket.id;
    addChatMessage(sender, text, isSelf, isSystem);
  });

  socket.on('receive-reaction', ({ reaction }) => {
    animateEmoji(reaction);
  });

  socket.on('typing-status', ({ id, nickname, isTyping }) => {
    if (isTyping) {
      typingUsers.set(id, nickname);
    } else {
      typingUsers.delete(id);
    }
    renderTypingIndicator();
  });

  socket.on('request-host-sync', ({ requestorId }) => {
    if (!isHost || currentVideoType === 'iframe') return;
    
    socket.emit('send-sync-to-peer', {
      peerId: requestorId,
      currentTime: videoElement.currentTime,
      playing: !videoElement.paused,
      speed: videoElement.playbackRate
    });
  });

  socket.on('receive-sync', ({ currentTime, playing, speed }) => {
    if (currentVideoType === 'iframe') return;

    isSyncing = true;
    videoElement.currentTime = currentTime;
    videoElement.playbackRate = speed || 1;
    speedLabel.innerText = `${speed || 1}x`;
    
    document.querySelectorAll('.speed-opt').forEach(opt => {
      opt.classList.remove('active');
      if (parseFloat(opt.getAttribute('data-speed')) === (speed || 1)) opt.classList.add('active');
    });

    if (playing) {
      videoElement.play().then(() => {
        isSyncing = false;
        customPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        playerWrapper.classList.remove('paused');
      }).catch(() => {
        isSyncing = false;
      });
    } else {
      videoElement.pause();
      isSyncing = false;
      customPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      playerWrapper.classList.add('paused');
    }
  });

  socket.on('room-closed-by-admin', ({ message }) => {
    destroyVideo();
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    
    showToast(message, 'error');
    
    socket.disconnect();
    socket.connect();
    showScreen('lobby-screen');
  });
}

function updateUsersList(users) {
  userCountDisplay.innerText = users.length;
  roomUsersList.innerHTML = '';
  
  users.forEach((u) => {
    const avatar = generateAvatarHtml(u.nickname);
    const li = document.createElement('li');
    li.className = `user-item${u.isHost ? ' user-item-host' : ''}`;
    li.innerHTML = `
      ${avatar}
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-weight: 500;">${u.nickname} ${u.id === socket.id ? '(Вы)' : ''}</span>
        ${u.isHost ? '<span class="badge" style="font-size: 0.6rem;">Хост</span>' : ''}
      </div>
    `;
    roomUsersList.appendChild(li);
  });
}

// ==========================================
// 6. ADMIN PANEL LOGIC
// ==========================================

function getAdminToken() {
  return sessionStorage.getItem('lox_admin_token');
}

function checkAdminAuth() {
  const token = getAdminToken();
  if (token) {
    adminLoginContainer.style.display = 'none';
    adminDashboardContainer.style.display = 'block';
    btnAdminLogout.style.display = 'inline-flex';
    loadAdminDashboard();
  } else {
    adminLoginContainer.style.display = 'block';
    adminDashboardContainer.style.display = 'none';
    btnAdminLogout.style.display = 'none';
  }
}

async function performAdminLogin() {
  const username = adminUsernameInput.value.trim();
  const password = adminPasswordInput.value.trim();
  
  if (!username || !password) {
    showToast('Пожалуйста, заполните все поля.', 'error');
    return;
  }

  try {
    const res = await fetch(`${socketUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      sessionStorage.setItem('lox_admin_token', data.token);
      adminUsernameInput.value = '';
      adminPasswordInput.value = '';
      checkAdminAuth();
      showToast('Вход выполнен успешно!');
    } else {
      showToast(data.message || 'Ошибка авторизации.', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

async function loadAdminDashboard() {
  const token = getAdminToken();
  if (!token) return;

  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const statsRes = await fetch(`${socketUrl}/api/admin/stats`, { headers });
    if (statsRes.status === 403) {
      adminLogout();
      return;
    }
    const stats = await statsRes.json();
    statRoomsCount.innerText = stats.roomsCount;
    statUsersCount.innerText = stats.usersCount;
    statCatalogCount.innerText = stats.catalogCount;

    const roomsRes = await fetch(`${socketUrl}/api/admin/rooms`, { headers });
    const rooms = await roomsRes.json();
    renderAdminRooms(rooms);

    const catalogRes = await fetch(`${socketUrl}/api/admin/catalog`);
    const catalog = await catalogRes.json();
    renderAdminCatalog(catalog);
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
  }
}

function renderAdminRooms(rooms) {
  adminRoomsTbody.innerHTML = '';
  if (rooms.length === 0) {
    adminRoomsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;" class="text-muted">Нет активных комнат</td></tr>';
    return;
  }

  rooms.forEach((room) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: bold; color: var(--text-main);">${room.code}</td>
      <td>${room.hostNickname}</td>
      <td>${room.usersCount} зрителей</td>
      <td title="${room.currentVideoTitle}">${room.currentVideoTitle}</td>
      <td>
        <button class="btn btn-danger btn-sm btn-kick-room" data-code="${room.code}">
          Закрыть
        </button>
      </td>
    `;

    tr.querySelector('.btn-kick-room').addEventListener('click', async (e) => {
      const code = e.currentTarget.getAttribute('data-code');
      if (confirm(`Вы уверены, что хотите принудительно закрыть комнату ${code}?`)) {
        await deleteAdminRoom(code);
      }
    });

    adminRoomsTbody.appendChild(tr);
  });
}

async function deleteAdminRoom(code) {
  const token = getAdminToken();
  try {
    const res = await fetch(`${socketUrl}/api/admin/rooms/${code}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message);
      loadAdminDashboard();
    } else {
      showToast(data.message || 'Ошибка.', 'error');
    }
  } catch (error) {
    console.error('Delete room error:', error);
  }
}

function renderAdminCatalog(catalog) {
  adminCatalogTbody.innerHTML = '';
  if (catalog.length === 0) {
    adminCatalogTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;" class="text-muted">Каталог пуст</td></tr>';
    return;
  }

  catalog.forEach((movie) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: bold;">${movie.title}</td>
      <td><span class="badge">${movie.type}</span></td>
      <td>
        <button class="btn btn-danger btn-sm btn-delete-movie" data-id="${movie.id}">
          Удалить
        </button>
      </td>
    `;

    tr.querySelector('.btn-delete-movie').addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm(`Удалить фильм "${movie.title}" из каталога?`)) {
        await deleteAdminMovie(id);
      }
    });

    adminCatalogTbody.appendChild(tr);
  });
}

async function deleteAdminMovie(id) {
  const token = getAdminToken();
  try {
    const res = await fetch(`${socketUrl}/api/admin/catalog/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message);
      loadAdminDashboard();
      await fetchCatalog();
    } else {
      showToast(data.message || 'Ошибка.', 'error');
    }
  } catch (error) {
    console.error('Delete movie error:', error);
  }
}

async function addCatalogMovie(e) {
  e.preventDefault();
  const token = getAdminToken();
  
  const movieData = {
    title: newMovieTitle.value.trim(),
    rating: newMovieRating.value.trim(),
    type: newMovieType.value,
    url: newMovieUrl.value.trim(),
    poster: newMoviePoster.value.trim(),
    description: newMovieDesc.value.trim()
  };

  try {
    const res = await fetch(`${socketUrl}/api/admin/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(movieData)
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Фильм "${movieData.title}" успешно добавлен!`);
      adminAddMovieForm.reset();
      loadAdminDashboard();
      await fetchCatalog();
    } else {
      showToast(data.message || 'Ошибка.', 'error');
    }
  } catch (error) {
    console.error('Add movie error:', error);
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const token = getAdminToken();
  
  const username = settingsUsernameInput.value.trim();
  const password = settingsPasswordInput.value.trim();

  try {
    const res = await fetch(`${socketUrl}/api/admin/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Настройки входа изменены! Авторизуйтесь заново.');
      adminSettingsForm.reset();
      adminLogout();
    } else {
      showToast(data.message || 'Ошибка.', 'error');
    }
  } catch (error) {
    console.error('Save settings error:', error);
  }
}

function adminLogout() {
  sessionStorage.removeItem('lox_admin_token');
  checkAdminAuth();
}

// ==========================================
// 7. Event Listeners Setup
// ==========================================

function setupEventListeners() {
  setupSocketEvents();

  // Navigation Setup
  headerLogo.addEventListener('click', () => {
    window.location.hash = '';
    showScreen('landing-screen');
  });

  btnNavAdmin.addEventListener('click', () => {
    window.location.hash = '#admin';
  });

  // Landing Page CTA Button Transition
  btnStartApp.addEventListener('click', () => {
    showScreen('lobby-screen');
  });

  // Modals Triggers
  btnTriggerCreate.addEventListener('click', () => openModal(modalCreateRoom));
  btnTriggerJoin.addEventListener('click', () => openModal(modalJoinRoom));
  btnCloseCreateModal.addEventListener('click', () => closeModal(modalCreateRoom));
  btnCloseJoinModal.addEventListener('click', () => closeModal(modalJoinRoom));

  // Modal Create Form Submit
  btnModalCreate.addEventListener('click', () => {
    const nickname = modalNicknameCreate.value.trim();
    if (!nickname) {
      showToast('Пожалуйста, введите ваше имя.', 'error');
      modalNicknameCreate.focus();
      return;
    }
    myNickname = nickname;
    localStorage.setItem('lox_nickname', nickname);
    socket.emit('create-room', { nickname });
    closeModal(modalCreateRoom);
  });

  // Modal Join Form Submit
  btnModalJoin.addEventListener('click', () => {
    const nickname = modalNicknameJoin.value.trim();
    if (!nickname) {
      showToast('Пожалуйста, введите ваше имя.', 'error');
      modalNicknameJoin.focus();
      return;
    }

    const code = modalCodeJoin.value.trim();
    if (code.length !== 5 || isNaN(code)) {
      showToast('Пожалуйста, введите корректный 5-значный код комнаты.', 'error');
      modalCodeJoin.focus();
      return;
    }

    myNickname = nickname;
    localStorage.setItem('lox_nickname', nickname);
    socket.emit('join-room', { roomCode: code, nickname });
    closeModal(modalJoinRoom);
  });

  // Load Video
  btnLoadVideo.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();
    const title = videoTitleInput.value.trim() || 'Пользовательское видео';
    
    if (!url) {
      showToast('Пожалуйста, вставьте ссылку на видео.', 'error');
      return;
    }

    const type = detectVideoType(url);
    let cleanUrl = url;
    if (type === 'iframe' && url.startsWith('<iframe')) {
      const match = url.match(/src=["'](.*?)["']/);
      if (match && match[1]) {
        cleanUrl = match[1];
      }
    }

    socket.emit('change-video', { url: cleanUrl, type, title });
    videoUrlInput.value = '';
    videoTitleInput.value = '';
  });

  // Custom subtitles loader trigger
  subtitlesFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadSubtitlesFile(file);
    }
  });

  // Leave Room
  const leaveRoomHandler = () => {
    if (confirm('Вы уверены, что хотите выйти из комнаты?')) {
      destroyVideo();
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
      
      socket.disconnect();
      socket.connect();
      showScreen('lobby-screen');
    }
  };
  btnLeaveRoom.addEventListener('click', leaveRoomHandler);
  logoBackToLobby.addEventListener('click', leaveRoomHandler);

  // Copy Share Link
  btnCopyLink.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${myRoomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Ссылка скопирована в буфер обмена!');
    }).catch(() => {
      const tempInput = document.createElement('input');
      tempInput.value = shareUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      showToast('Ссылка скопирована в буфер обмена!');
    });
  });

  // Chat Form Submit Message
  chatInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatMessageInput.value.trim();
    if (text) {
      socket.emit('send-message', { text });
      chatMessageInput.value = '';
      sendTypingStatus(false);
    }
  });

  // Typing status input trigger
  chatMessageInput.addEventListener('input', updateTypingStatus);

  // Floating Reaction Clicking
  document.querySelectorAll('.reaction-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reaction = btn.getAttribute('data-reaction');
      animateEmoji(reaction);
      socket.emit('send-reaction', { reaction });
    });
  });

  // Sidebar Tabs Toggle
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // ==========================================
  // CUSTOM VIDEO CONTROLS LISTENERS
  // ==========================================

  // Controls Auto-Hide listeners
  playerWrapper.addEventListener('mousemove', resetControlsHideTimer);
  videoElement.addEventListener('play', resetControlsHideTimer);
  videoElement.addEventListener('pause', resetControlsHideTimer);

  // Play / Pause toggle
  const togglePlayPause = () => {
    if (currentVideoType === 'iframe') return;
    
    if (videoElement.paused) {
      isSyncing = true;
      videoElement.play().then(() => {
        isSyncing = false;
        showBigPlayOverlay(true);
        customPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        playerWrapper.classList.remove('paused');
        if (isHost) socket.emit('play-video', { currentTime: videoElement.currentTime });
      });
    } else {
      isSyncing = true;
      videoElement.pause();
      isSyncing = false;
      showBigPlayOverlay(false);
      customPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      playerWrapper.classList.add('paused');
      if (isHost) socket.emit('pause-video', { currentTime: videoElement.currentTime });
    }
  };

  customPlayBtn.addEventListener('click', togglePlayPause);
  videoElement.addEventListener('click', togglePlayPause);

  // Timeline tracking
  videoElement.addEventListener('timeupdate', updateTimelineProgress);
  videoElement.addEventListener('progress', updateTimelineProgress);

  // Timeline seeking
  let isDraggingTimeline = false;

  customProgressContainer.addEventListener('mousedown', (e) => {
    isDraggingTimeline = true;
    handleTimelineClick(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingTimeline) {
      handleTimelineClick(e);
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingTimeline = false;
  });

  // Volume buttons mute/unmute
  customVolumeBtn.addEventListener('click', toggleMute);

  // Volume slider sync
  const customVolumeSlider = customVolumeSliderContainer.querySelector('input');
  customVolumeSlider.addEventListener('input', (e) => {
    setPlayerVolume(parseFloat(e.target.value));
  });

  // Fullscreen trigger
  customFullscreenBtn.addEventListener('click', toggleFullscreen);
  videoElement.addEventListener('dblclick', toggleFullscreen);

  // Close dropdowns when clicking outside
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.control-menu-wrapper')) {
      document.querySelectorAll('.control-menu-wrapper').forEach(w => w.classList.remove('open'));
    }
  });

  // Toggle speed menu
  customSpeedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = customSpeedBtn.closest('.control-menu-wrapper');
    const wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.control-menu-wrapper').forEach(w => w.classList.remove('open'));
    if (!wasOpen) wrap.classList.add('open');
  });

  // Playback speeds selection
  document.querySelectorAll('.speed-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.getAttribute('data-speed'));
      isSyncing = true;
      videoElement.playbackRate = speed;
      speedLabel.innerText = `${speed}x`;
      
      document.querySelectorAll('.speed-opt').forEach(opt => opt.classList.remove('active'));
      btn.classList.add('active');
      customSpeedBtn.closest('.control-menu-wrapper').classList.remove('open');
      
      if (isHost) {
        socket.emit('change-speed', { speed });
      }
      setTimeout(() => { isSyncing = false; }, 200);
    });
  });

  // Toggle audio tracks menu
  customAudioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = customAudioBtn.closest('.control-menu-wrapper');
    const wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.control-menu-wrapper').forEach(w => w.classList.remove('open'));
    if (!wasOpen) wrap.classList.add('open');
  });

  // Toggle subtitles track
  customSubsBtn.addEventListener('click', () => {
    if (videoElement.textTracks.length === 0) return;
    const track = videoElement.textTracks[0];
    if (track.mode === 'showing') {
      track.mode = 'hidden';
      customSubsBtn.style.color = 'var(--text-muted)';
    } else {
      track.mode = 'showing';
      customSubsBtn.style.color = '#ffffff';
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // ==========================================
  // ADMIN PANEL LISTENERS
  // ==========================================

  window.addEventListener('hashchange', checkUrlHash);

  logoAdminBackToLobby.addEventListener('click', () => {
    window.location.hash = '';
  });

  btnAdminLogin.addEventListener('click', performAdminLogin);
  adminPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performAdminLogin();
  });

  btnAdminLogout.addEventListener('click', adminLogout);

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-admin-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  adminAddMovieForm.addEventListener('submit', addCatalogMovie);
  adminSettingsForm.addEventListener('submit', saveAdminSettings);
}

// Start client app
init();
