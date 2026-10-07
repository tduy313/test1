/* ============================================================
   app.js
   UI + orchestration — phụ thuộc colorScience.js (window.ColorScience)
   KHÔNG chứa logic thuật toán màu (đã tách sang colorScience.js)
   ============================================================ */

'use strict';

// Shortcut đến module colorScience
var CS = window.ColorScience;

/* ============================================================
   HELPERS
   ============================================================ */
function $(id){ return document.getElementById(id); }

function toast(msg){
  var t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.classList.remove('show'); }, 2400);
  if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
}

/* ============================================================
   STATE — chỉ chứa dữ liệu runtime, KHÔNG chứa refColors/coefficients
   (2 thứ đó đã nằm trong colorScience.js)
   ============================================================ */
var state = {
  stream: null,
  image: null,
  imageThumb: null,
  imageDataFull: null,
  whiteBalance: null,
  pickedRGB: null,
  pickedRGBCorrected: null,
  pickedHSV: null,
  pickedLab: null,
  currentPH: null,
  currentStatus: null,
  currentConfidence: null,
  currentDE: null,
  currentRefMatch: null,
  currentLab: null
};

/* ============================================================
   RECOMMENDATION DATA (loaded from JSON)
   ============================================================ */
var recommendData = null;

function loadRecommendations(){
  return fetch('recommendations.json')
    .then(function(res){
      if(!res.ok) throw new Error('Không tải được recommendations.json');
      return res.json();
    })
    .then(function(data){
      recommendData = data;
      console.log('[Recommendations] Đã tải dữ liệu');
      return data;
    })
    .catch(function(err){
      console.warn('[Recommendations]', err.message);
      recommendData = null;
      return null;
    });
}

/* ============================================================
   TABS
   ============================================================ */
function showTab(name){
  var contents = document.querySelectorAll('.tab-content');
  for(var i = 0; i < contents.length; i++) contents[i].classList.remove('active');
  var target = $(name);
  if(target) target.classList.add('active');

  var tabs = document.querySelectorAll('.tab');
  for(var j = 0; j < tabs.length; j++){
    tabs[j].classList.toggle('active', tabs[j].getAttribute('data-tab') === name);
  }

  if(name === 'home') renderHome();

  if(name !== 'scan'){
    stopCameraStream();
    stopQRTimer();
    if($('qrPanel')) $('qrPanel').style.display = 'none';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

var tabBtns = document.querySelectorAll('.tab');
for(var i = 0; i < tabBtns.length; i++){
  tabBtns[i].addEventListener('click', function(){
    showTab(this.getAttribute('data-tab'));
  });
}

var gotoBtns = document.querySelectorAll('[data-goto]');
for(var k = 0; k < gotoBtns.length; k++){
  gotoBtns[k].addEventListener('click', function(){
    showTab(this.getAttribute('data-goto'));
  });
}

/* ============================================================
   CAMERA PERMISSION
   ============================================================ */
var camState = {
  permission: 'unknown',
  devices: [],
  selectedDeviceId: null,
  stream: null,
  supported: true
};

function isCameraSupported(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function queryCameraPermission(){
  return new Promise(function(resolve){
    if(!isCameraSupported()){
      camState.permission = 'unsupported';
      resolve('unsupported');
      return;
    }
    if(!navigator.permissions || !navigator.permissions.query){
      camState.permission = 'unknown';
      resolve('unknown');
      return;
    }
    navigator.permissions.query({ name: 'camera' })
      .then(function(status){
        camState.permission = status.state;
        status.onchange = function(){
          camState.permission = status.state;
          renderCameraPermUI();
          if(status.state === 'granted') enumerateCameras();
        };
        resolve(status.state);
      })
      .catch(function(){
        camState.permission = 'unknown';
        resolve('unknown');
      });
  });
}

function enumerateCameras(){
  if(!isCameraSupported()) return Promise.resolve([]);
  return navigator.mediaDevices.enumerateDevices()
    .then(function(devices){
      camState.devices = devices.filter(function(d){ return d.kind === 'videoinput'; });
      var sel = $('camDeviceSelect');
      if(sel){
        sel.innerHTML = '';
        camState.devices.forEach(function(d, i){
          var opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('Camera ' + (i+1));
          sel.appendChild(opt);
        });
        if(camState.devices.length) camState.selectedDeviceId = camState.devices[0].deviceId;
      }
      var row = $('camDeviceRow');
      if(row) row.style.display = camState.devices.length > 1 ? 'block' : 'none';
      return camState.devices;
    })
    .catch(function(){ return []; });
}

function requestCameraPermission(){
  return new Promise(function(resolve, reject){
    if(!isCameraSupported()){
      reject(new Error('Trình duyệt không hỗ trợ camera.'));
      return;
    }
    var constraints = { video: true, audio: false };
    if(camState.selectedDeviceId){
      constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
    }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream){
        stream.getTracks().forEach(function(t){ t.stop(); });
        camState.permission = 'granted';
        resolve('granted');
      })
      .catch(function(err){
        if(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'){
          camState.permission = 'denied';
          resolve('denied');
        } else if(err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'){
          resolve('no-device');
        } else {
          reject(err);
        }
      });
  });
}

function getPermissionHelpText(){
  var ua = navigator.userAgent.toLowerCase();
  var isMobile = /android|iphone|ipad|ipod/.test(ua);
  if(/chrome/.test(ua) && !isMobile){
    return '<b>🔴 Camera đã bị chặn trên Chrome</b><br>Bấm vào <b>biểu tượng 🔒 hoặc ⚠️</b> bên trái thanh địa chỉ → chọn <b>Site settings</b> → mục <b>Camera</b> → chọn <b>Allow</b> → tải lại trang (F5).';
  }
  if(/chrome/.test(ua) && isMobile){
    return '<b>🔴 Camera đã bị chặn trên Chrome Mobile</b><br>Bấm <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Permissions</b> → <b>Camera</b> → <b>Allow</b> → tải lại trang.';
  }
  if(/safari/.test(ua)){
    return '<b>🔴 Camera đã bị chặn trên Safari</b><br>Vào <b>Cài đặt</b> → <b>Safari</b> → <b>Camera</b> → chọn <b>Allow</b>. Hoặc vào <b>Cài đặt → Quyền riêng tư → Camera</b> → bật cho Safari.';
  }
  if(/firefox/.test(ua)){
    return '<b>🔴 Camera đã bị chặn trên Firefox</b><br>Bấm vào <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Xóa quyền</b> → tải lại trang (F5) → bấm <b>Allow</b> khi được hỏi.';
  }
  if(/edg/.test(ua)){
    return '<b>🔴 Camera đã bị chặn trên Edge</b><br>Bấm <b>biểu tượng 🔒</b> → <b>Permissions for this site</b> → <b>Camera</b> → <b>Allow</b> → tải lại trang.';
  }
  return '<b>🔴 Camera đã bị chặn</b><br>Mở cài đặt trình duyệt → Quyền trang web → Camera → Cho phép → tải lại trang.';
}

function renderCameraPermUI(){
  var status = $('camPermStatus');
  var btnReq = $('requestCamPerm');
  var btnStart = $('startCam');
  var help = $('camPermHelp');
  var helpText = $('camPermHelpText');
  if(!status) return;

  var badgeClass = 'cam-badge ';
  var badgeText = '';
  var canStart = false;

  if(camState.permission === 'granted'){
    badgeClass += 'granted';
    badgeText = '<span class="' + badgeClass + '">🟢 Đã cấp quyền</span>';
    canStart = true;
    if(help) help.style.display = 'none';
    if(btnReq){ btnReq.textContent = '✅ Đã cấp'; btnReq.disabled = true; }
    status.innerHTML = 'Camera đã sẵn sàng sử dụng.' + badgeText;
  } else if(camState.permission === 'prompt' || camState.permission === 'unknown'){
    badgeClass += 'prompt';
    badgeText = '<span class="' + badgeClass + '">🟡 Chưa cấp quyền</span>';
    if(help) help.style.display = 'none';
    if(btnReq){ btnReq.textContent = '🔐 Cấp quyền Camera'; btnReq.disabled = false; }
    status.innerHTML = 'Bấm nút bên phải để cấp quyền.' + badgeText;
  } else if(camState.permission === 'denied'){
    badgeClass += 'denied';
    badgeText = '<span class="' + badgeClass + '">🔴 Đã bị chặn</span>';
    if(help){ help.style.display = 'block'; if(helpText) helpText.innerHTML = getPermissionHelpText(); }
    if(btnReq){ btnReq.textContent = '🔁 Thử lại'; btnReq.disabled = false; }
    status.innerHTML = 'Camera đang bị chặn.' + badgeText;
  } else if(camState.permission === 'unsupported'){
    badgeClass += 'unsupported';
    badgeText = '<span class="' + badgeClass + '">⚪ Không hỗ trợ</span>';
    if(btnReq){ btnReq.textContent = '❌ Không hỗ trợ'; btnReq.disabled = true; }
    status.innerHTML = 'Trình duyệt không hỗ trợ camera.' + badgeText;
  }

  if(btnStart){
    btnStart.disabled = !canStart || !!camState.stream;
  }
}

function initCameraPermission(){
  function doInit(){
    var checkSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    if(!checkSupported && location.protocol === 'https:'){
      setTimeout(doInit, 500);
      return;
    }

    if(!checkSupported){
      camState.supported = false;
      camState.permission = 'unsupported';
      renderCameraPermUI();
      return;
    }

    queryCameraPermission().then(function(){
      renderCameraPermUI();
      if(camState.permission === 'granted') enumerateCameras();
      document.addEventListener('visibilitychange', function(){
        if(!document.hidden){
          queryCameraPermission().then(function(){
            renderCameraPermUI();
            if(camState.permission === 'granted' && !camState.devices.length) enumerateCameras();
          });
        }
      });
    });

    var btnReq = $('requestCamPerm');
    if(btnReq){
      btnReq.addEventListener('click', function(){
        btnReq.textContent = '⏳ Đang xin quyền...';
        btnReq.disabled = true;
        requestCameraPermission().then(function(result){
          if(result === 'granted'){
            toast('✅ Đã được cấp quyền camera');
            return enumerateCameras().then(function(){ renderCameraPermUI(); });
          } else if(result === 'denied'){
            toast('❌ Bạn đã từ chối. Xem hướng dẫn bên dưới.');
            renderCameraPermUI();
          } else if(result === 'no-device'){
            toast('⚠️ Không tìm thấy camera trên thiết bị');
            renderCameraPermUI();
          }
        }).catch(function(err){
          toast('❌ Lỗi: ' + err.message);
          renderCameraPermUI();
        });
      });
    }

    var sel = $('camDeviceSelect');
    if(sel){
      sel.addEventListener('change', function(){
        camState.selectedDeviceId = this.value;
        if(camState.stream){
          camState.stream.getTracks().forEach(function(t){ t.stop(); });
          camState.stream = null;
          state.stream = null;
          startCameraStream();
        }
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    setTimeout(doInit, 100);
  }
}

function startCameraStream(){
  if(!isCameraSupported()){ toast('Trình duyệt không hỗ trợ camera.'); return; }
  if(camState.stream) return;

  var constraints = {
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };
  if(camState.selectedDeviceId){
    constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
  }

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream){
      camState.stream = stream;
      state.stream = stream;
      $('video').srcObject = stream;
      $('captureBtn').disabled = false;

      var btn = $('startCam');
      btn.innerHTML = '<span class="action-icon">⏹️</span><span class="action-label">Tắt Camera</span><span class="action-hint">Đang bật</span>';
      btn.classList.remove('primary');
      btn.classList.add('danger-action');
      toast('✅ Camera đã bật');
    })
    .catch(function(err){
      if(err.name === 'NotAllowedError'){
        camState.permission = 'denied';
        renderCameraPermUI();
        toast('❌ Bạn đã chặn camera. Xem hướng dẫn bên dưới.');
      } else if(err.name === 'NotFoundError'){
        toast('⚠️ Không tìm thấy camera');
      } else {
        toast('❌ Lỗi camera: ' + err.message);
      }
    });
}

function stopCameraStream(){
  if(camState.stream){
    camState.stream.getTracks().forEach(function(t){ t.stop(); });
    camState.stream = null;
    state.stream = null;
    if($('startCam')){
      var btn = $('startCam');
      btn.innerHTML = '<span class="action-icon">🎥</span><span class="action-label">Bật Camera</span><span class="action-hint">Máy này</span>';
      btn.classList.add('primary');
      btn.classList.remove('danger-action');
      btn.disabled = camState.permission !== 'granted';
    }
    if($('captureBtn')) $('captureBtn').disabled = true;
  }
}

if($('startCam')){
  $('startCam').addEventListener('click', function(){
    if(camState.stream){ stopCameraStream(); return; }
    startCameraStream();
  });
}

if($('captureBtn')){
  $('captureBtn').addEventListener('click', function(){
    var video = $('video');
    if(!video.videoWidth){ toast('Camera chưa sẵn sàng'); return; }
    var canvas = $('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    loadImageFromDataUrl(dataUrl);
  });
}

/* ============================================================
   LOAD ẢNH
   ============================================================ */
function loadImageFromDataUrl(dataUrl){
  var img = new Image();
  img.onload = function(){
    state.image = img;

    var tc = document.createElement('canvas');
    var maxSize = 400;
    var scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    tc.width = img.width * scale;
    tc.height = img.height * scale;
    tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
    state.imageThumb = tc.toDataURL('image/jpeg', 0.7);

    goStep(2);
    initCropSelector();
  };
  img.src = dataUrl;
}

function handleFile(e){
  var file = e.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(ev){
    showTab('scan');
    setTimeout(function(){ loadImageFromDataUrl(ev.target.result); }, 100);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

if($('fileScan')) $('fileScan').addEventListener('change', handleFile);
if($('fileHome')) $('fileHome').addEventListener('change', handleFile);

/* ============================================================
   STEPS
   ============================================================ */
function goStep(n){
  $('step1').style.display    = (n === 1) ? 'block' : 'none';
  $('stepCrop').style.display = (n === 2) ? 'block' : 'none';
  $('step2').style.display    = (n === 3) ? 'block' : 'none';
  $('step4').style.display    = (n === 4) ? 'block' : 'none';

  var steps = document.querySelectorAll('.step');
  for(var i = 0; i < steps.length; i++){
    steps[i].classList.toggle('active', i < n);
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

function resetScan(){
  state.image = null;
  state.pickedRGB = null;
  state.pickedRGBCorrected = null;
  state.currentPH = null;
  state.imageDataFull = null;
  state.whiteBalance = null;

  var box = $('receivedPhotoBox');
  if(box){ box.style.display = 'none'; box.dataset.dataUrl = ''; }
  clearInterval(autoStepTimer);

  cropState.hasSelection = false;
  cropState.isDragging = false;
  goStep(1);
}

/* ============================================================
   CROP ẢNH THỦ CÔNG
   ============================================================ */
var cropState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,
  hasSelection: false,
  scale: 1,
  canvasW: 0,
  canvasH: 0
};

function initCropSelector(){
  if(!state.image) return;
  var canvas = $('cropSelectCanvas');
  if(!canvas) return;

  var maxW = Math.min(window.innerWidth - 60, 620);
  var scale = Math.min(maxW / state.image.width, 1);
  canvas.width = Math.round(state.image.width * scale);
  canvas.height = Math.round(state.image.height * scale);

  cropState.scale = scale;
  cropState.canvasW = canvas.width;
  cropState.canvasH = canvas.height;
  cropState.isDragging = false;
  cropState.hasSelection = false;
  cropState.startX = 0;
  cropState.startY = 0;
  cropState.endX = 0;
  cropState.endY = 0;

  $('confirmCropBtn').disabled = true;
  $('cropSizeInfo').textContent = '—';
  $('cropPosInfo').textContent = '—';

  redrawCropCanvas();

  canvas.removeEventListener('mousedown', cropMouseDown);
  canvas.removeEventListener('mousemove', cropMouseMove);
  canvas.removeEventListener('mouseup', cropMouseUp);
  canvas.removeEventListener('touchstart', cropTouchStart);
  canvas.removeEventListener('touchmove', cropTouchMove);
  canvas.removeEventListener('touchend', cropTouchEnd);

  canvas.addEventListener('mousedown', cropMouseDown);
  canvas.addEventListener('mousemove', cropMouseMove);
  canvas.addEventListener('mouseup', cropMouseUp);
  canvas.addEventListener('touchstart', cropTouchStart, {passive:false});
  canvas.addEventListener('touchmove', cropTouchMove, {passive:false});
  canvas.addEventListener('touchend', cropTouchEnd);
}

function redrawCropCanvas(){
  var canvas = $('cropSelectCanvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);

  if(cropState.hasSelection && !cropState.isDragging){
    var x1 = Math.min(cropState.startX, cropState.endX);
    var y1 = Math.min(cropState.startY, cropState.endY);
    var x2 = Math.max(cropState.startX, cropState.endX);
    var y2 = Math.max(cropState.startY, cropState.endY);
    var w = x2 - x1;
    var h = y2 - y1;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, y1);
    ctx.fillRect(0, y2, canvas.width, canvas.height - y2);
    ctx.fillRect(0, y1, x1, h);
    ctx.fillRect(x2, y1, canvas.width - x2, h);
    ctx.restore();

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for(var i = 1; i < 3; i++){
      ctx.beginPath();
      ctx.moveTo(x1 + w * i / 3, y1);
      ctx.lineTo(x1 + w * i / 3, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1 + h * i / 3);
      ctx.lineTo(x2, y1 + h * i / 3);
      ctx.stroke();
    }

    var cornerSize = 12;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x1 - 4, y1 - 4, cornerSize, cornerSize);
    ctx.fillRect(x2 - cornerSize + 4, y1 - 4, cornerSize, cornerSize);
    ctx.fillRect(x1 - 4, y2 - cornerSize + 4, cornerSize, cornerSize);
    ctx.fillRect(x2 - cornerSize + 4, y2 - cornerSize + 4, cornerSize, cornerSize);
  } else if(cropState.isDragging){
    var x1 = Math.min(cropState.startX, cropState.endX);
    var y1 = Math.min(cropState.startY, cropState.endY);
    var x2 = Math.max(cropState.startX, cropState.endX);
    var y2 = Math.max(cropState.startY, cropState.endY);
    var w = x2 - x1;
    var h = y2 - y1;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x1, y1, w, h);
    ctx.setLineDash([]);
  }
}

function getCanvasPos(e, isTouch){
  var canvas = $('cropSelectCanvas');
  var rect = canvas.getBoundingClientRect();
  var clientX = isTouch ? e.touches[0].clientX : e.clientX;
  var clientY = isTouch ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function cropMouseDown(e){
  var pos = getCanvasPos(e, false);
  cropState.isDragging = true;
  cropState.hasSelection = false;
  cropState.startX = pos.x;
  cropState.startY = pos.y;
  cropState.endX = pos.x;
  cropState.endY = pos.y;
  $('confirmCropBtn').disabled = true;
  redrawCropCanvas();
}

function cropMouseMove(e){
  if(!cropState.isDragging) return;
  var pos = getCanvasPos(e, false);
  cropState.endX = pos.x;
  cropState.endY = pos.y;
  redrawCropCanvas();
  updateCropInfo();
}

function cropMouseUp(){
  if(!cropState.isDragging) return;
  cropState.isDragging = false;
  finalizeCrop();
}

function cropTouchStart(e){
  e.preventDefault();
  var pos = getCanvasPos(e, true);
  cropState.isDragging = true;
  cropState.hasSelection = false;
  cropState.startX = pos.x;
  cropState.startY = pos.y;
  cropState.endX = pos.x;
  cropState.endY = pos.y;
  $('confirmCropBtn').disabled = true;
  redrawCropCanvas();
}

function cropTouchMove(e){
  e.preventDefault();
  if(!cropState.isDragging) return;
  var pos = getCanvasPos(e, true);
  cropState.endX = pos.x;
  cropState.endY = pos.y;
  redrawCropCanvas();
  updateCropInfo();
}

function cropTouchEnd(e){
  e.preventDefault();
  if(!cropState.isDragging) return;
  cropState.isDragging = false;
  finalizeCrop();
}

function finalizeCrop(){
  var w = Math.abs(cropState.endX - cropState.startX);
  var h = Math.abs(cropState.endY - cropState.startY);

  if(w < 30 || h < 30){
    cropState.hasSelection = false;
    $('confirmCropBtn').disabled = true;
    $('cropSizeInfo').textContent = '—';
    $('cropPosInfo').textContent = '—';
    redrawCropCanvas();
    return;
  }

  cropState.hasSelection = true;
  $('confirmCropBtn').disabled = false;
  updateCropInfo();
  redrawCropCanvas();
}

function updateCropInfo(){
  var x1 = Math.min(cropState.startX, cropState.endX);
  var y1 = Math.min(cropState.startY, cropState.endY);
  var x2 = Math.max(cropState.startX, cropState.endX);
  var y2 = Math.max(cropState.startY, cropState.endY);
  var w = Math.round((x2 - x1) / cropState.scale);
  var h = Math.round((y2 - y1) / cropState.scale);
  var xOrig = Math.round(x1 / cropState.scale);
  var yOrig = Math.round(y1 / cropState.scale);

  $('cropSizeInfo').textContent = w + ' × ' + h + ' px';
  $('cropPosInfo').textContent = '(' + xOrig + ', ' + yOrig + ')';
}

function confirmCrop(){
  if(!cropState.hasSelection){ toast('Chưa chọn vùng nào'); return; }

  var x1 = Math.min(cropState.startX, cropState.endX) / cropState.scale;
  var y1 = Math.min(cropState.startY, cropState.endY) / cropState.scale;
  var x2 = Math.max(cropState.startX, cropState.endX) / cropState.scale;
  var y2 = Math.max(cropState.startY, cropState.endY) / cropState.scale;
  var w = x2 - x1;
  var h = y2 - y1;

  var cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(w);
  cropCanvas.height = Math.round(h);
  cropCanvas.getContext('2d').drawImage(state.image, x1, y1, w, h, 0, 0, cropCanvas.width, cropCanvas.height);

  var croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.92);
  var newImg = new Image();
  newImg.onload = function(){
    state.image = newImg;
    toast('✅ Đã crop ảnh (' + cropCanvas.width + 'x' + cropCanvas.height + ')');
    goStep(3);
    drawCropCanvas();
  };
  newImg.src = croppedDataUrl;
}

function skipCrop(){
  toast('Bỏ qua crop — dùng ảnh gốc');
  goStep(3);
  drawCropCanvas();
}

function resetCropSelection(){
  cropState.hasSelection = false;
  cropState.isDragging = false;
  cropState.startX = 0;
  cropState.startY = 0;
  cropState.endX = 0;
  cropState.endY = 0;
  $('confirmCropBtn').disabled = true;
  $('cropSizeInfo').textContent = '—';
  $('cropPosInfo').textContent = '—';
  redrawCropCanvas();
}

document.addEventListener('DOMContentLoaded', function(){
  var btnConfirm = $('confirmCropBtn');
  if(btnConfirm) btnConfirm.addEventListener('click', confirmCrop);

  var btnReset = $('resetCropBtn');
  if(btnReset) btnReset.addEventListener('click', resetCropSelection);

  var btnSkip = $('skipCropBtn');
  if(btnSkip) btnSkip.addEventListener('click', skipCrop);
});

/* ============================================================
   CROP CANVAS — Chọn màu (gọi colorScience)
   ============================================================ */
function drawCropCanvas(){
  if(!state.image) return;
  var c = $('cropCanvas');
  var ctx = c.getContext('2d');
  var maxW = Math.min(window.innerWidth - 40, 620);
  var scale = Math.min(maxW / state.image.width, 1);
  c.width = Math.round(state.image.width * scale);
  c.height = Math.round(state.image.height * scale);
  ctx.drawImage(state.image, 0, 0, c.width, c.height);

  state.imageDataFull = ctx.getImageData(0, 0, c.width, c.height);
  state.whiteBalance = CS.autoWhiteBalance(state.imageDataFull);
  pickColor(c.width / 2, c.height / 2);
}

function pickColor(x, y){
  if(!state.imageDataFull) return;
  var imgData = state.imageDataFull;
  var sampled = CS.sampleColors(imgData, Math.round(x), Math.round(y), 5);
  if(!sampled.count){ toast('Không lấy được mẫu màu'); return; }

  state.pickedRGB = { r: sampled.r, g: sampled.g, b: sampled.b };

  var wb = state.whiteBalance;
  var corr = {
    r: Math.max(0, Math.min(255, Math.round(sampled.r * wb.scaleR))),
    g: Math.max(0, Math.min(255, Math.round(sampled.g * wb.scaleG))),
    b: Math.max(0, Math.min(255, Math.round(sampled.b * wb.scaleB)))
  };
  state.pickedRGBCorrected = corr;
  state.pickedHSV = CS.rgb2hsv(corr.r, corr.g, corr.b);
  state.pickedLab = CS.rgb2lab(corr.r, corr.g, corr.b);

  $('pickPos').textContent = '(' + Math.round(x) + ', ' + Math.round(y) + ') · ' + sampled.count + ' mẫu';
  $('rgbVal').textContent  = sampled.r + ', ' + sampled.g + ', ' + sampled.b;
  $('rgbCorr').textContent = corr.r + ', ' + corr.g + ', ' + corr.b;
  $('hsvVal').textContent  = state.pickedHSV.h + '°, ' + state.pickedHSV.s + '%, ' + state.pickedHSV.v + '%';
  $('swatch').style.background = 'rgb(' + corr.r + ',' + corr.g + ',' + corr.b + ')';
}

if($('cropCanvas')){
  $('cropCanvas').addEventListener('click', function(e){
    var rect = e.target.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (e.target.width / rect.width);
    var y = (e.clientY - rect.top) * (e.target.height / rect.height);
    pickColor(x, y);
  });
}

/* ============================================================
   ANALYZE — gọi colorScience
   ============================================================ */
function analyze(){
  if(!state.pickedRGBCorrected){ toast('Chưa chọn màu!'); return; }

  // ⭐ GỌI COLORSCIENCE — không còn estimatePHAdvanced nội bộ
  var result = CS.estimatePH(state.pickedRGBCorrected);
  var ph = result.ph;
  var info = CS.classifyPH(ph);

  state.currentPH = ph;
  state.currentStatus = info;
  state.currentConfidence = result.confidence;
  state.currentDE = result.bestDE;
  state.currentRefMatch = result.refMatch;
  state.currentLab = result.lab;

  // Animation đếm số pH
  var phEl = $('phValue');
  var targetPH = ph;
  var duration = 900;
  var startTime = performance.now();
  function tick(now){
    var p = Math.min((now - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - p, 3);
    phEl.textContent = (targetPH * eased).toFixed(1);
    if(p < 1) requestAnimationFrame(tick);
    else phEl.textContent = targetPH.toFixed(1);
  }
  requestAnimationFrame(tick);

  $('phStatus').textContent = 'Đất ' + info.status;
  $('phStatus').className = 'status-badge ' + info.cls;

  var conf = result.confidence;
  var confColor = conf >= 80 ? '#10b981' : conf >= 60 ? '#f59e0b' : '#ef4444';
  $('confFill').style.width = conf + '%';
  $('confFill').style.background = 'linear-gradient(90deg,' + confColor + ',' + confColor + 'cc)';
  $('confTxt').textContent = conf + '% · ' + (
    conf >= 80 ? 'Rất tốt' :
    conf >= 60 ? 'Khá tốt' :
    conf >= 40 ? 'Trung bình' : 'Thấp — nên đo lại'
  );

  $('r3').textContent = state.pickedRGB.r + ', ' + state.pickedRGB.g + ', ' + state.pickedRGB.b;
  $('rgbCorr3').textContent = state.pickedRGBCorrected.r + ', ' + state.pickedRGBCorrected.g + ', ' + state.pickedRGBCorrected.b;
  $('h3').textContent = state.pickedHSV.h + '°, ' + state.pickedHSV.s + '%, ' + state.pickedHSV.v + '%';
  $('lab3').textContent = 'L:' + result.lab.L.toFixed(1) + ' a:' + result.lab.a.toFixed(1) + ' b:' + result.lab.b.toFixed(1);
  $('de3').textContent = result.bestDE.toFixed(1);
  $('refMatch').textContent = 'pH ' + result.refMatch.ph;

  $('recommend').innerHTML = buildRecommendation(ph, result.confidence, result.lab, result.bestDE, result.refMatch);

  goStep(4);

  if(conf >= 80) celebrate();
}

function celebrate(){
  setTimeout(function(){
    for(var i = 0; i < 12; i++){
      (function(){
        var c = document.createElement('div');
        c.textContent = ['🌱','✨','🌿','💚'][i % 4];
        c.style.cssText = 'position:fixed;left:' + (50 + (Math.random()-0.5)*40) + '%;top:40%;font-size:' + (14 + Math.random()*14) + 'px;pointer-events:none;z-index:9998;opacity:0;transition:all 1.2s cubic-bezier(.34,1.56,.64,1)';
        document.body.appendChild(c);
        requestAnimationFrame(function(){
          c.style.opacity = '1';
          c.style.transform = 'translate(' + ((Math.random()-0.5)*300) + 'px,' + (-100 - Math.random()*200) + 'px) rotate(' + ((Math.random()-0.5)*360) + 'deg)';
        });
        setTimeout(function(){ c.remove(); }, 1400);
      })();
    }
  }, 300);
}

/* ============================================================
   BUILD RECOMMENDATION (từ JSON)
   ============================================================ */
function formatLines(lines, vars){
  if(!lines) return '';
  return lines.map(function(line){
    return line.replace(/\{(\w+)\}/g, function(_, key){
      return (vars && vars[key] !== undefined) ? vars[key] : '';
    });
  }).join('<br>');
}

function buildRecommendation(ph, confidence, lab, bestDE, refMatch){
  if(!recommendData){
    return '<div class="alert alert-danger">⚠️ Không tải được dữ liệu gợi ý cải tạo. Vui lòng kiểm tra file <b>recommendations.json</b>.</div>';
  }

  // ⭐ Dùng CS.classifyPHDetailed thay vì if/else nội bộ
  var groupKey = CS.classifyPHDetailed(ph);
  var group = recommendData.groups[groupKey];
  if(!group){
    return '<div class="alert alert-danger">⚠️ Không tìm thấy nhóm đất phù hợp.</div>';
  }

  var targetPH = recommendData.targetPH || 5.8;
  var deltaPH = Math.max(0, targetPH - ph);
  var limePerM2   = deltaPH * (recommendData.limePerM2PerPH || 0.1);
  var limePerTree = deltaPH * (recommendData.limePerTreePerPH || 5);

  var vars = {
    limePerM2: Math.round(limePerM2 * 10) / 10,
    limePerTree: Math.round(limePerTree * 10) / 10
  };

  var html = '';
  html += '<h4 style="margin:0 0 12px;color:' + group.color + ';font-size:1.1rem">';
  html += group.icon + ' ' + group.title + ' — pH ' + ph.toFixed(1);
  html += '</h4>';

  // Chẩn đoán
  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid ' + group.color + '">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:6px">🔍 Chẩn đoán</div>';
  html += '<div style="font-size:.85rem;line-height:1.6">' + group.diagnosis + '</div>';
  html += '</div>';

  // Phương án
  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid #f59e0b">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:8px">🛠️ Phương án cải tạo</div>';
  html += '<div style="font-size:.85rem;line-height:1.7">';
  group.treatments.forEach(function(t, idx){
    html += '<b>' + t.title + '</b><br>';
    html += '&nbsp;&nbsp;' + formatLines(t.lines, vars).split('<br>').join('<br>&nbsp;&nbsp;');
    html += (idx < group.treatments.length - 1) ? '<br><br>' : '';
  });
  html += '</div></div>';

  // Lịch trình
  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid #3b82f6">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:8px">📅 Lịch trình đề xuất</div>';
  html += '<div style="font-size:.85rem;line-height:1.7">';
  html += group.schedule.join('<br>');
  html += '</div></div>';

  // Lưu ý
  html += '<div style="background:#fef3c7;padding:12px;border-radius:8px;border-left:4px solid #f59e0b">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:6px">⚠️ Lưu ý quan trọng</div>';
  html += '<div style="font-size:.82rem;line-height:1.7">';
  html += group.notes.join('<br>');
  html += '</div></div>';

  // Chất lượng phân tích
  var confLabel = confidence >= 80 ? '🟢 Cao' : confidence >= 60 ? '🟡 Khá' : confidence >= 40 ? '🟠 Trung bình' : '🔴 Thấp';
  html += '<div style="background:#eff6ff;padding:10px;border-radius:8px;border-left:4px solid #3b82f6;font-size:.8rem;margin-top:10px">';
  html += '<b>📊 Chất lượng phân tích:</b> ' + confLabel + ' (' + confidence + '%) · ';
  html += 'Màu gần nhất: <b>pH ' + refMatch.ph + '</b> · ΔE = ' + bestDE.toFixed(1);
  if(confidence < 60){
    html += '<br><span style="color:#dc2626">⚠️ Độ tin cậy thấp — nên đo lại với ánh sáng tốt hơn hoặc dùng giấy quỳ mới.</span>';
  }
  html += '</div>';

  return html;
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  var el = $('todayDate');
  if(!el) return;
  el.textContent = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/* ============================================================
   ONLINE / OFFLINE
   ============================================================ */
function updateStatus(){
  var el = $('onlineStatus');
  if(!el) return;
  var online = navigator.onLine;
  el.textContent = online ? '● Online' : '● Offline';
  el.style.background = online ? 'rgba(255,255,255,.2)' : 'rgba(239,68,68,.5)';
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

/* ============================================================
   WEBSOCKET (PieSocket)
   ============================================================ */
var PIESOCKET_CONFIG = {
  clusterId: 'free.blr2',
  apiKey: 'sJTFr7fnhoX3fbL2dhGUHeH7w6nHBvthAZ0mWR3J'
};

var wsState = {
  socket: null,
  roomId: null,
  token: null,
  connected: false,
  expiresAt: 0,
  timer: null,
  photoReceived: false,
  mode: 'host'
};

var autoStepTimer = null;

function makeToken(len){
  len = len || 24;
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var s = '';
  var arr = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  for(var i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

function getBaseUrl(){
  return location.href.split('#')[0].split('?')[0];
}

function isFileProtocol(){
  return location.protocol === 'file:';
}

function updateWSStatus(status){
  var el = $('wsStatus');
  if(!el) return;
  el.className = '';
  if(status === 'connected'){
    el.textContent = 'WS: đã kết nối';
    el.classList.add('connected');
  } else if(status === 'connecting'){
    el.textContent = 'WS: đang kết nối...';
    el.classList.add('connecting');
  } else {
    el.textContent = 'WS: chưa kết nối';
    el.classList.add('disconnected');
  }
}

function openQRPanel(){
  if(isFileProtocol()){
    toast('⚠️ Đang mở file:// — QR chỉ mở được trên máy này.');
  }
  $('qrPanel').style.display = 'block';
  createQRToken();
  connectHostWebSocket();
}

function createQRToken(){
  wsState.roomId = 'durian_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  wsState.token = makeToken(16);
  wsState.expiresAt = Date.now() + 3 * 60 * 1000;
  wsState.photoReceived = false;

  var box = $('receivedPhotoBox');
  if(box){ box.style.display = 'none'; box.dataset.dataUrl = ''; }
  clearInterval(autoStepTimer);

  var url = getBaseUrl() + '?room=' + encodeURIComponent(wsState.roomId) + '&token=' + encodeURIComponent(wsState.token);

  var boxQR = $('qrBox');
  boxQR.innerHTML = '';
  try {
    new QRCode(boxQR, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#047857',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e){
    boxQR.innerHTML = '<div style="color:#ef4444;font-size:.85rem">Không tạo được QR.<br>' + url + '</div>';
  }

  var urlBox = document.getElementById('qrUrlDisplay');
  if(!urlBox){
    urlBox = document.createElement('div');
    urlBox.id = 'qrUrlDisplay';
    urlBox.style.cssText = 'font-size:.72rem;color:#6b7280;margin-top:8px;word-break:break-all;background:#f9fafb;padding:6px;border-radius:6px';
    boxQR.parentNode.appendChild(urlBox);
  }
  urlBox.textContent = url;

  stopQRTimer();
  wsState.timer = setInterval(function(){
    var left = wsState.expiresAt - Date.now();
    if(left <= 0){
      $('qrCountdown').textContent = '00:00';
      $('qrStatus').textContent = '❌ Mã đã hết hạn. Bấm "Tạo mã mới" để tiếp tục.';
      stopQRTimer();
      return;
    }
    $('qrCountdown').textContent = fmtTime(left);
  }, 500);

  $('qrStatus').textContent = 'Đang kết nối WebSocket...';
}

function stopQRTimer(){
  if(wsState.timer){ clearInterval(wsState.timer); wsState.timer = null; }
}

function connectHostWebSocket(){
  if(wsState.socket){
    try { wsState.socket.close(); } catch(e){}
    wsState.socket = null;
  }

  updateWSStatus('connecting');
  $('qrStatus').textContent = '⏳ Đang kết nối WebSocket...';

  var wsUrl = 'wss://' + PIESOCKET_CONFIG.clusterId + '.piesocket.com/v3/' +
              encodeURIComponent(wsState.roomId) +
              '?api_key=' + encodeURIComponent(PIESOCKET_CONFIG.apiKey) +
              '&notify_self=1';

  try {
    wsState.socket = new WebSocket(wsUrl);
  } catch(e){
    $('qrStatus').textContent = '❌ Không tạo được WebSocket: ' + e.message;
    updateWSStatus('disconnected');
    return;
  }

  wsState.socket.onopen = function(){
    wsState.connected = true;
    updateWSStatus('connected');
    $('qrStatus').innerHTML = '✅ <b style="color:#10b981">Đã kết nối WebSocket!</b> Đang chờ điện thoại quét QR...';
    toast('✅ WebSocket đã kết nối');
  };

  wsState.socket.onmessage = function(event){
    try {
      var msg = JSON.parse(event.data);
      handleHostMessage(msg);
    } catch(e){
      console.warn('[WS] Không parse được:', event.data);
    }
  };

  wsState.socket.onerror = function(){
    updateWSStatus('disconnected');
    $('qrStatus').textContent = '❌ Lỗi WebSocket. Kiểm tra API key/cluster ID.';
  };

  wsState.socket.onclose = function(){
    wsState.connected = false;
    updateWSStatus('disconnected');
    if(wsState.mode === 'host' && $('qrPanel') && $('qrPanel').style.display !== 'none'){
      $('qrStatus').innerHTML = '⚠️ Mất kết nối WebSocket. Bấm <b>Tạo mã mới</b> để thử lại.';
    }
  };
}

function handleHostMessage(msg){
  if(!msg) return;

  var type = msg.type || msg.event;
  var data = msg.data || msg.payload || msg;

  if(msg.token && msg.token !== wsState.token) return;
  if(Date.now() > wsState.expiresAt){
    $('qrStatus').textContent = '❌ Mã đã hết hạn.';
    return;
  }

  if(type === 'hello'){
    $('qrStatus').innerHTML = '📱 <b style="color:#10b981">Điện thoại đã kết nối!</b> Đang chờ ảnh...';
  } else if(type === 'photo'){
    if(wsState.photoReceived) return;
    wsState.photoReceived = true;

    var dataUrl = data.dataUrl || data.photo || data;
    if(typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return;

    $('qrStatus').innerHTML = '✅ <b style="color:#10b981">Đã nhận ảnh!</b>';
    stopQRTimer();
    setTimeout(function(){
      $('qrPanel').style.display = 'none';
      showReceivedPhoto(dataUrl);
      toast('📥 Đã nhận ảnh từ điện thoại');
    }, 300);
  }
}

function showReceivedPhoto(dataUrl){
  var box = $('receivedPhotoBox');
  var img = $('receivedPhotoImg');
  var info = $('receivedPhotoInfo');

  img.src = dataUrl;
  box.style.display = 'block';

  var sizeKB = Math.round(dataUrl.length * 0.75 / 1024);
  info.textContent = 'Nhận lúc ' + new Date().toLocaleTimeString('vi-VN') + ' · ~' + sizeKB + ' KB';
  box.dataset.dataUrl = dataUrl;

  setTimeout(function(){
    box.scrollIntoView({behavior:'smooth', block:'center'});
  }, 200);

  var countdown = 5;
  $('autoStepCountdown').textContent = countdown;
  clearInterval(autoStepTimer);
  autoStepTimer = setInterval(function(){
    countdown--;
    var el = $('autoStepCountdown');
    if(el) el.textContent = countdown;
    if(countdown <= 0){
      clearInterval(autoStepTimer);
      useReceivedPhoto();
    }
  }, 1000);
}

function useReceivedPhoto(){
  clearInterval(autoStepTimer);
  var box = $('receivedPhotoBox');
  var dataUrl = box.dataset.dataUrl;
  if(!dataUrl){ toast('Không có ảnh để dùng'); return; }
  box.style.display = 'none';
  loadImageFromDataUrl(dataUrl);
}

function cancelAutoStep(){
  clearInterval(autoStepTimer);
  var box = $('receivedPhotoBox');
  if(box) box.style.display = 'none';
}

function fmtTime(ms){
  if(ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  s = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/* ============================================================
   PHONE MODE
   ============================================================ */
function runPhoneMode(roomId, token){
  wsState.mode = 'phone';
  wsState.roomId = roomId;
  wsState.token = token;

  document.body.innerHTML = '' +
    '<div style="max-width:520px;margin:0 auto;padding:16px;font-family:Arial">' +
      '<div style="background:linear-gradient(135deg,#10b981,#047857);color:#fff;padding:14px;border-radius:12px;text-align:center;font-weight:800;box-shadow:0 8px 24px rgba(16,185,129,.35)">' +
        '📱 Camera điện thoại — DurianSoil' +
      '</div>' +
      '<div id="phoneWsStatus" style="margin:10px 0;padding:10px;background:#fef3c7;color:#92400e;border-radius:10px;font-size:.82rem;text-align:center;font-weight:600">⏳ Đang kết nối WebSocket...</div>' +
      '<div id="phonePermBox" style="margin:12px 0;padding:12px;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.08)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<div>' +
            '<b style="font-size:.9rem">🎥 Quyền Camera</b>' +
            '<div id="phonePermStatus" style="font-size:.82rem;color:#6b7280;margin-top:4px">Đang kiểm tra...</div>' +
          '</div>' +
          '<button id="phoneReqBtn" style="padding:10px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#10b981,#047857);color:#fff;font-weight:700;font-size:.85rem;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,.35)">🔐 Cấp quyền</button>' +
        '</div>' +
      '</div>' +
      '<div id="phoneMsg" style="margin:12px 0;padding:12px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:10px;font-size:.85rem">' +
        'Chờ kết nối WebSocket...' +
      '</div>' +
      '<div style="position:relative;width:100%;padding-bottom:75%;background:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.35)">' +
        '<video id="pVideo" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>' +
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
          '<div style="width:72%;height:26%;border:3px dashed #fff;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.4),0 0 30px rgba(16,185,129,.4)"></div>' +
        '</div>' +
      '</div>' +
      '<button id="pShot" style="display:block;width:100%;margin:14px 0;padding:16px;border:none;border-radius:12px;background:linear-gradient(135deg,#10b981,#047857);color:#fff;font-size:1.05rem;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(16,185,129,.4)" disabled>📸 Chụp & gửi về máy tính</button>' +
      '<button id="pSwitch" style="display:block;width:100%;margin:8px 0;padding:12px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-size:.92rem;font-weight:600;cursor:pointer">🔄 Đổi camera trước/sau</button>' +
      '<canvas id="pCanvas" style="display:none"></canvas>' +
      '<div style="font-size:.82rem;color:#6b7280;margin-top:14px;text-align:center">Ảnh sẽ gửi qua WebSocket — <b>có thể dùng 4G!</b></div>' +
      '<div id="phoneDebug" style="font-size:.7rem;color:#9ca3af;margin-top:8px;font-family:monospace;text-align:center"></div>' +
    '</div>';

  var facing = 'environment';
  var stream = null;

  function dbg(t){
    var el = document.getElementById('phoneDebug');
    if(el) el.textContent = t;
  }

  function setMsg(t, color){
    var el = document.getElementById('phoneMsg');
    el.textContent = t;
    el.style.background = color === 'err' ? '#fef2f2' : color === 'ok' ? '#ecfdf5' : '#fffbeb';
    el.style.borderLeftColor = color === 'err' ? '#ef4444' : color === 'ok' ? '#10b981' : '#f59e0b';
  }

  function setWsStatus(t, color){
    var el = document.getElementById('phoneWsStatus');
    if(!el) return;
    el.textContent = t;
    if(color === 'ok'){ el.style.background = '#d1fae5'; el.style.color = '#065f46'; }
    else if(color === 'err'){ el.style.background = '#fee2e2'; el.style.color = '#991b1b'; }
    else { el.style.background = '#fef3c7'; el.style.color = '#92400e'; }
  }

  function setPermStatus(text, color){
    var el = document.getElementById('phonePermStatus');
    el.innerHTML = text;
    el.style.color = color || '#6b7280';
  }

  var wsUrl = 'wss://' + PIESOCKET_CONFIG.clusterId + '.piesocket.com/v3/' +
              encodeURIComponent(roomId) +
              '?api_key=' + encodeURIComponent(PIESOCKET_CONFIG.apiKey) +
              '&notify_self=0';

  try {
    wsState.socket = new WebSocket(wsUrl);
  } catch(e){
    setWsStatus('❌ Không tạo được WebSocket: ' + e.message, 'err');
    return;
  }

  wsState.socket.onopen = function(){
    setWsStatus('✅ Đã kết nối WebSocket', 'ok');
    setMsg('Bấm "Cấp quyền" để bật camera.', 'info');

    try {
      wsState.socket.send(JSON.stringify({
        event: 'hello',
        type: 'hello',
        token: token,
        data: { from: 'phone' }
      }));
      dbg('Đã gửi hello');
    } catch(e){
      dbg('Lỗi gửi hello: ' + e.message);
    }
  };

  wsState.socket.onerror = function(){
    setWsStatus('❌ Lỗi WebSocket.', 'err');
  };

  wsState.socket.onclose = function(){
    setWsStatus('⚠️ Mất kết nối WebSocket', 'err');
  };

  function startCam(){
    if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      setMsg('Trình duyệt không hỗ trợ camera.', 'err');
      setPermStatus('⚪ Không hỗ trợ', '#6b7280');
      return;
    }
    setMsg('⏳ Đang xin quyền camera...', 'info');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then(function(s){
        stream = s;
        document.getElementById('pVideo').srcObject = s;
        setMsg('✅ Camera sẵn sàng. Căn giấy quỳ vào khung rồi bấm Chụp.', 'ok');
        setPermStatus('🟢 Đã cấp quyền', '#10b981');
        var btn = document.getElementById('phoneReqBtn');
        btn.textContent = '✅ Đã cấp';
        btn.disabled = true;
        btn.style.background = '#d1fae5';
        btn.style.color = '#065f46';
        document.getElementById('pShot').disabled = false;
      })
      .catch(function(err){
        if(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'){
          setPermStatus('🔴 Đã bị chặn', '#ef4444');
          setMsg('❌ Bạn đã từ chối quyền camera.', 'err');
        } else if(err.name === 'NotFoundError'){
          setPermStatus('⚠️ Không có camera', '#f59e0b');
          setMsg('❌ Không tìm thấy camera.', 'err');
        } else {
          setMsg('❌ Lỗi camera: ' + err.message, 'err');
        }
      });
  }

  document.getElementById('phoneReqBtn').addEventListener('click', function(){
    this.textContent = '⏳ Đang xin...';
    this.disabled = true;
    startCam();
  });

  document.getElementById('pShot').addEventListener('click', function(){
    var v = document.getElementById('pVideo');
    if(!v.videoWidth){ setMsg('Camera chưa sẵn sàng.', 'err'); return; }
    if(!wsState.socket || wsState.socket.readyState !== WebSocket.OPEN){
      setMsg('❌ WebSocket chưa kết nối. Đợi thêm vài giây.', 'err');
      return;
    }

    var c = document.getElementById('pCanvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);

    var dataUrl = c.toDataURL('image/jpeg', 0.75);
    var sizeKB = Math.round(dataUrl.length * 0.75 / 1024);

    setMsg('📤 Đang gửi ảnh (' + sizeKB + 'KB)...', 'info');
    dbg('Gửi ảnh: ' + sizeKB + 'KB');

    try {
      wsState.socket.send(JSON.stringify({
        event: 'photo',
        type: 'photo',
        token: token,
        data: { dataUrl: dataUrl }
      }));
      setMsg('✅ Đã gửi ảnh (' + sizeKB + 'KB). Chờ máy tính nhận...', 'ok');
      dbg('Đã gửi lúc ' + new Date().toLocaleTimeString('vi-VN'));
    } catch(e){
      setMsg('❌ Lỗi gửi: ' + e.message, 'err');
      dbg('LỖI: ' + e.message);
    }
  });

  document.getElementById('pSwitch').addEventListener('click', function(){
    facing = facing === 'environment' ? 'user' : 'environment';
    startCam();
  });

  if(navigator.permissions && navigator.permissions.query){
    navigator.permissions.query({ name: 'camera' }).then(function(st){
      if(st.state === 'granted'){
        setPermStatus('🟢 Đã cấp quyền', '#10b981');
        startCam();
      } else if(st.state === 'denied'){
        setPermStatus('🔴 Đã bị chặn', '#ef4444');
        setMsg('❌ Camera đã bị chặn.', 'err');
      } else {
        setPermStatus('🟡 Chưa cấp quyền', '#f59e0b');
      }
    }).catch(function(){
      setPermStatus('🟡 Bấm để cấp quyền', '#f59e0b');
    });
  } else {
    setPermStatus('🟡 Bấm để cấp quyền', '#f59e0b');
  }
}

/* ============================================================
   GẮN SỰ KIỆN
   ============================================================ */
if($('qrConnectBtn')) $('qrConnectBtn').addEventListener('click', openQRPanel);

if($('qrRenewBtn')){
  $('qrRenewBtn').addEventListener('click', function(){
    createQRToken();
    connectHostWebSocket();
    toast('🔄 Đã tạo mã QR mới');
  });
}

if($('qrCloseBtn')){
  $('qrCloseBtn').addEventListener('click', function(){
    stopQRTimer();
    if(wsState.socket && wsState.mode === 'host'){
      try { wsState.socket.close(); } catch(e){}
    }
    $('qrPanel').style.display = 'none';
  });
}

(function bindReceivedPhotoButtons(){
  var btnUse = $('useReceivedPhotoBtn');
  if(btnUse) btnUse.addEventListener('click', useReceivedPhoto);

  var btnRetake = $('retakePhotoBtn');
  if(btnRetake){
    btnRetake.addEventListener('click', function(){
      cancelAutoStep();
      var box = $('receivedPhotoBox');
      if(box){ box.style.display = 'none'; box.dataset.dataUrl = ''; }
      openQRPanel();
      toast('🔄 Mở lại QR');
    });
  }
})();

(function checkPhoneMode(){
  var params = new URLSearchParams(location.search);
  var roomId = params.get('room');
  var token = params.get('token');

  if(roomId){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', function(){
        runPhoneMode(roomId, token || '');
      });
    } else {
      runPhoneMode(roomId, token || '');
    }
  }
})();

/* ============================================================
   INIT
   ============================================================ */
renderHome();
updateStatus();
initCameraPermission();
loadRecommendations();