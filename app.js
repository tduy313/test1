/* ============================================================
   HELPERS
   ============================================================ */
function $(id){return document.getElementById(id);}
function toast(msg){
  var t=$('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('show');},2400);
  if(navigator.vibrate)try{navigator.vibrate(15);}catch(e){}
}
function classifyPH(ph){
  if(ph<5.5)return{status:'Chua',cls:'status-chua',color:'#ef4444'};
  if(ph<=6.5)return{status:'Tối ưu',cls:'status-toiuu',color:'#10b981'};
  return{status:'Kiềm',cls:'status-kiem',color:'#3b82f6'};
}

/* ============================================================
   MÀU - CHUYỂN ĐỔI KHÔNG GIAN MÀU
   ============================================================ */
function rgb2hsv(r,g,b){
  r/=255;g/=255;b/=255;
  var max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  var h=0,s=max===0?0:d/max,v=max;
  if(d!==0){
    if(max===r)h=(g-b)/d+(g<b?6:0);
    else if(max===g)h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  return {h:Math.round(h),s:Math.round(s*100),v:Math.round(v*100)};
}

function rgb2xyz(r,g,b){
  function inv(c){c=c/255;return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);}
  var R=inv(r)*100, G=inv(g)*100, B=inv(b)*100;
  return {
    x: R*0.4124564 + G*0.3575761 + B*0.1804375,
    y: R*0.2126729 + G*0.7151522 + B*0.0721750,
    z: R*0.0193339 + G*0.1191920 + B*0.9503041
  };
}

function xyz2lab(x,y,z){
  var Xn=95.047, Yn=100.000, Zn=108.883;
  function f(t){return t>0.008856 ? Math.pow(t,1/3) : (7.787*t + 16/116);}
  var fx=f(x/Xn), fy=f(y/Yn), fz=f(z/Zn);
  return {L: 116*fy - 16,a: 500*(fx - fy),b: 200*(fy - fz)};
}

function rgb2lab(r,g,b){
  var xyz=rgb2xyz(r,g,b);
  return xyz2lab(xyz.x,xyz.y,xyz.z);
}

function deltaE2000(lab1,lab2){
  var L1=lab1.L, a1=lab1.a, b1=lab1.b;
  var L2=lab2.L, a2=lab2.a, b2=lab2.b;
  var kL=1, kC=1, kH=1;
  var C1=Math.sqrt(a1*a1+b1*b1);
  var C2=Math.sqrt(a2*a2+b2*b2);
  var Cbar=(C1+C2)/2;
  var G=0.5*(1-Math.sqrt(Math.pow(Cbar,7)/(Math.pow(Cbar,7)+Math.pow(25,7))));
  var a1p=(1+G)*a1;
  var a2p=(1+G)*a2;
  var C1p=Math.sqrt(a1p*a1p+b1*b1);
  var C2p=Math.sqrt(a2p*a2p+b2*b2);
  var h1p=Math.atan2(b1,a1p)*180/Math.PI;
  if(h1p<0)h1p+=360;
  var h2p=Math.atan2(b2,a2p)*180/Math.PI;
  if(h2p<0)h2p+=360;
  var dLp=L2-L1;
  var dCp=C2p-C1p;
  var dhp=0;
  if(C1p*C2p!==0){
    dhp=h2p-h1p;
    if(dhp>180)dhp-=360;
    else if(dhp<-180)dhp+=360;
  }
  var dHp=2*Math.sqrt(C1p*C2p)*Math.sin(dhp*Math.PI/360);
  var Lbarp=(L1+L2)/2;
  var Cbarp=(C1p+C2p)/2;
  var hbarp=0;
  if(C1p*C2p!==0){
    hbarp=(h1p+h2p)/2;
    if(Math.abs(h1p-h2p)>180){
      if(h1p+h2p<360)hbarp=(h1p+h2p+360)/2;
      else hbarp=(h1p+h2p-360)/2;
    }
  }
  var T=1 - 0.17*Math.cos((hbarp-30)*Math.PI/180)
        + 0.24*Math.cos(2*hbarp*Math.PI/180)
        + 0.32*Math.cos((3*hbarp+6)*Math.PI/180)
        - 0.20*Math.cos((4*hbarp-63)*Math.PI/180);
  var SL=1 + (0.015*Math.pow(Lbarp-50,2))/Math.sqrt(20+Math.pow(Lbarp-50,2));
  var SC=1 + 0.045*Cbarp;
  var SH=1 + 0.015*Cbarp*T;
  var RT=-2*Math.sqrt(Math.pow(Cbarp,7)/(Math.pow(Cbarp,7)+Math.pow(25,7)))
    *Math.sin(60*Math.exp(-Math.pow((hbarp-275)/25,2))*Math.PI/180);
  var dE=Math.sqrt(
    Math.pow(dLp/(kL*SL),2) +
    Math.pow(dCp/(kC*SC),2) +
    Math.pow(dHp/(kH*SH),2) +
    RT*(dCp/(kC*SC))*(dHp/(kH*SH))
  );
  return dE;
}

function autoWhiteBalance(imgData){
  var data=imgData.data;
  var sumR=0,sumG=0,sumB=0,n=0;
  for(var i=0;i<data.length;i+=4){
    sumR+=data[i]; sumG+=data[i+1]; sumB+=data[i+2]; n++;
  }
  var avgR=sumR/n, avgG=sumG/n, avgB=sumB/n;
  var gray=(avgR+avgG+avgB)/3;
  var scaleR=gray/avgR, scaleG=gray/avgG, scaleB=gray/avgB;
  scaleR=Math.max(0.7,Math.min(1.4,scaleR));
  scaleG=Math.max(0.7,Math.min(1.4,scaleG));
  scaleB=Math.max(0.7,Math.min(1.4,scaleB));
  return {scaleR:scaleR, scaleG:scaleG, scaleB:scaleB};
}

function sampleColors(imgData, cx, cy, size){
  var data=imgData.data;
  var w=imgData.width;
  var half=Math.floor(size/2);
  var samples=[];
  for(var y=cy-half;y<=cy+half;y++){
    for(var x=cx-half;x<=cx+half;x++){
      if(x<0||y<0||x>=imgData.width||y>=imgData.height)continue;
      var idx=(y*w+x)*4;
      samples.push({r:data[idx],g:data[idx+1],b:data[idx+2]});
    }
  }
  if(!samples.length)return{r:0,g:0,b:0,count:0};
  var rs=samples.map(function(s){return s.r;}).sort(function(a,b){return a-b;});
  var gs=samples.map(function(s){return s.g;}).sort(function(a,b){return a-b;});
  var bs=samples.map(function(s){return s.b;}).sort(function(a,b){return a-b;});
  function iqrRange(arr){
    var q1=arr[Math.floor(arr.length*0.25)];
    var q3=arr[Math.floor(arr.length*0.75)];
    var iqr=q3-q1;
    return {lo:q1-1.5*iqr, hi:q3+1.5*iqr};
  }
  var rr=iqrRange(rs), gr=iqrRange(gs), br=iqrRange(bs);
  var sumR=0,sumG=0,sumB=0,cnt=0;
  for(var i=0;i<samples.length;i++){
    var s=samples[i];
    if(s.r>=rr.lo&&s.r<=rr.hi&&s.g>=gr.lo&&s.g<=gr.hi&&s.b>=br.lo&&s.b<=br.hi){
      sumR+=s.r; sumG+=s.g; sumB+=s.b; cnt++;
    }
  }
  if(cnt===0)return{r:0,g:0,b:0,count:0};
  return{r:Math.round(sumR/cnt),g:Math.round(sumG/cnt),b:Math.round(sumB/cnt),count:cnt};
}

function estimatePHAdvanced(correctedRGB, originalRGB){
  var lab=rgb2lab(correctedRGB.r, correctedRGB.g, correctedRGB.b);
  var deltas=[];
  for(var i=0;i<state.refColors.length;i++){
    var c=state.refColors[i];
    var labRef=rgb2lab(c.r, c.g, c.b);
    var dE=deltaE2000(lab, labRef);
    deltas.push({ph:c.ph, dE:dE, ref:c});
  }
  deltas.sort(function(a,b){return a.dE-b.dE;});
  var top=deltas.slice(0,3);
  var sumW=0, sumPH=0;
  for(var j=0;j<top.length;j++){
    var w=1/Math.pow(top[j].dE + 0.01, 2);
    sumW+=w;
    sumPH+=w*top[j].ph;
  }
  var ph=sumPH/sumW;
  var co=state.coefficients;
  var hsv=rgb2hsv(correctedRGB.r, correctedRGB.g, correctedRGB.b);
  var phReg=co.a*correctedRGB.r + co.b*correctedRGB.g + co.c*correctedRGB.b + co.d*hsv.h + co.e;
  ph = 0.8*ph + 0.2*phReg;
  ph=Math.max(4.0, Math.min(7.5, ph));
  var bestDE=top[0].dE;
  var secondDE=top[1].dE;
  var gap=secondDE - bestDE;
  var confColor = Math.max(0, Math.min(1, 1 - bestDE/30));
  var confSep   = Math.max(0, Math.min(1, gap/15));
  var confidence = 0.65*confColor + 0.35*confSep;
  var brightness = (correctedRGB.r + correctedRGB.g + correctedRGB.b)/3;
  if(brightness < 60 || brightness > 240) confidence *= 0.7;
  return {
    ph: Math.round(ph*10)/10,
    confidence: Math.round(confidence*100),
    lab: lab,
    bestDE: Math.round(bestDE*10)/10,
    refMatch: top[0],
    deltas: top
  };
}

/* ============================================================
   STATE
   ============================================================ */
var state={
  stream:null,
  image:null,
  imageThumb:null,
  imageDataFull:null,
  whiteBalance:null,
  pickedRGB:null,
  pickedRGBCorrected:null,
  pickedHSV:null,
  pickedLab:null,
  currentPH:null,
  currentStatus:null,
  currentConfidence:null,
  currentDE:null,
  currentRefMatch:null,
  currentLab:null,
  coefficients:{a:0.012,b:-0.015,c:0.008,d:0.025,e:3.5},
  refColors:[
    {ph:4.0,r:220,g:50, b:60 },
    {ph:4.5,r:230,g:100,b:70 },
    {ph:5.0,r:240,g:160,b:80 },
    {ph:5.5,r:250,g:210,b:90 },
    {ph:6.0,r:170,g:220,b:100},
    {ph:6.5,r:110,g:200,b:120},
    {ph:7.0,r:70, g:180,b:180},
    {ph:7.5,r:60, g:130,b:200}
  ]
};

/* ============================================================
   TABS
   ============================================================ */
function showTab(name){
  var contents=document.querySelectorAll('.tab-content');
  for(var i=0;i<contents.length;i++)contents[i].classList.remove('active');
  $(name).classList.add('active');
  var tabs=document.querySelectorAll('.tab');
  for(var j=0;j<tabs.length;j++){
    tabs[j].classList.toggle('active',tabs[j].getAttribute('data-tab')===name);
  }
  if(name==='home')renderHome();
  if(name!=='scan'){
    if(typeof stopCameraStream==='function') stopCameraStream();
    if(typeof stopQRTimer==='function'){
      stopQRTimer();
      if($('qrPanel')) $('qrPanel').style.display='none';
    }
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
var tabBtns=document.querySelectorAll('.tab');
for(var i=0;i<tabBtns.length;i++){
  tabBtns[i].addEventListener('click',function(){
    showTab(this.getAttribute('data-tab'));
  });
}
var gotoBtns=document.querySelectorAll('[data-goto]');
for(var k=0;k<gotoBtns.length;k++){
  gotoBtns[k].addEventListener('click',function(){
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
    if (!isCameraSupported()) {
      camState.permission = 'unsupported';
      resolve('unsupported');
      return;
    }
    if (!navigator.permissions || !navigator.permissions.query) {
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
          if (status.state === 'granted') enumerateCameras();
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
  if (!isCameraSupported()) return Promise.resolve([]);
  return navigator.mediaDevices.enumerateDevices()
    .then(function(devices){
      camState.devices = devices.filter(function(d){ return d.kind === 'videoinput'; });
      var sel = $('camDeviceSelect');
      if (sel) {
        sel.innerHTML = '';
        camState.devices.forEach(function(d, i){
          var opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('Camera ' + (i+1));
          sel.appendChild(opt);
        });
        if (camState.devices.length) camState.selectedDeviceId = camState.devices[0].deviceId;
      }
      var row = $('camDeviceRow');
      if (row) row.style.display = camState.devices.length > 1 ? 'block' : 'none';
      return camState.devices;
    })
    .catch(function(){ return []; });
}

function requestCameraPermission(){
  return new Promise(function(resolve, reject){
    if (!isCameraSupported()) { reject(new Error('Trình duyệt không hỗ trợ camera.')); return; }
    var constraints = { video: true, audio: false };
    if (camState.selectedDeviceId) constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream){
        stream.getTracks().forEach(function(t){ t.stop(); });
        camState.permission = 'granted';
        resolve('granted');
      })
      .catch(function(err){
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          camState.permission = 'denied';
          resolve('denied');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          resolve('no-device');
        } else { reject(err); }
      });
  });
}

function getPermissionHelpText(){
  var ua = navigator.userAgent.toLowerCase();
  var isMobile = /android|iphone|ipad|ipod/.test(ua);
  if (/chrome/.test(ua) && !isMobile) {
    return '<b>🔴 Camera đã bị chặn trên Chrome</b><br>Bấm vào <b>biểu tượng 🔒 hoặc ⚠️</b> bên trái thanh địa chỉ → chọn <b>Site settings</b> → mục <b>Camera</b> → chọn <b>Allow</b> → tải lại trang (F5).';
  }
  if (/chrome/.test(ua) && isMobile) {
    return '<b>🔴 Camera đã bị chặn trên Chrome Mobile</b><br>Bấm <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Permissions</b> → <b>Camera</b> → <b>Allow</b> → tải lại trang.';
  }
  if (/safari/.test(ua)) {
    return '<b>🔴 Camera đã bị chặn trên Safari</b><br>Vào <b>Cài đặt</b> → <b>Safari</b> → <b>Camera</b> → chọn <b>Allow</b>. Hoặc vào <b>Cài đặt → Quyền riêng tư → Camera</b> → bật cho Safari.';
  }
  if (/firefox/.test(ua)) {
    return '<b>🔴 Camera đã bị chặn trên Firefox</b><br>Bấm vào <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Xóa quyền</b> → tải lại trang (F5) → bấm <b>Allow</b> khi được hỏi.';
  }
  if (/edg/.test(ua)) {
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
  if (!status) return;

  var badgeClass = 'cam-badge ';
  var badgeText = '';
  var canStart = false;

  if (camState.permission === 'granted') {
    badgeClass += 'granted';
    badgeText = '<span class="' + badgeClass + '">🟢 Đã cấp quyền</span>';
    canStart = true;
    if (help) help.style.display = 'none';
    if (btnReq) { btnReq.textContent = '✅ Đã cấp'; btnReq.disabled = true; }
    status.innerHTML = 'Camera đã sẵn sàng sử dụng.' + badgeText;
  } else if (camState.permission === 'prompt' || camState.permission === 'unknown') {
    badgeClass += 'prompt';
    badgeText = '<span class="' + badgeClass + '">🟡 Chưa cấp quyền</span>';
    if (help) help.style.display = 'none';
    if (btnReq) { btnReq.textContent = '🔐 Cấp quyền Camera'; btnReq.disabled = false; }
    status.innerHTML = 'Bấm nút bên phải để cấp quyền.' + badgeText;
  } else if (camState.permission === 'denied') {
    badgeClass += 'denied';
    badgeText = '<span class="' + badgeClass + '">🔴 Đã bị chặn</span>';
    if (help) { help.style.display = 'block'; if (helpText) helpText.innerHTML = getPermissionHelpText(); }
    if (btnReq) { btnReq.textContent = '🔁 Thử lại'; btnReq.disabled = false; }
    status.innerHTML = 'Camera đang bị chặn.' + badgeText;
  } else if (camState.permission === 'unsupported') {
    badgeClass += 'unsupported';
    badgeText = '<span class="' + badgeClass + '">⚪ Không hỗ trợ</span>';
    if (btnReq) { btnReq.textContent = '❌ Không hỗ trợ'; btnReq.disabled = true; }
    status.innerHTML = 'Trình duyệt không hỗ trợ camera.' + badgeText;
  }

  if (btnStart) {
    // Chỉ bật khi đã cấp quyền VÀ chưa bật camera
    btnStart.disabled = !canStart || !!camState.stream;
  }
}

function initCameraPermission(){
  function doInit(){
    var checkSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    if (!checkSupported && location.protocol === 'https:') {
      setTimeout(doInit, 500);
      return;
    }

    if (!checkSupported) {
      camState.supported = false;
      camState.permission = 'unsupported';
      renderCameraPermUI();
      return;
    }

    queryCameraPermission().then(function(){
      renderCameraPermUI();
      if (camState.permission === 'granted') enumerateCameras();
      document.addEventListener('visibilitychange', function(){
        if (!document.hidden) {
          queryCameraPermission().then(function(){
            renderCameraPermUI();
            if (camState.permission === 'granted' && !camState.devices.length) enumerateCameras();
          });
        }
      });
    });

    var btnReq = $('requestCamPerm');
    if (btnReq) {
      btnReq.addEventListener('click', function(){
        btnReq.textContent = '⏳ Đang xin quyền...';
        btnReq.disabled = true;
        requestCameraPermission().then(function(result){
          if (result === 'granted') {
            toast('✅ Đã được cấp quyền camera');
            return enumerateCameras().then(function(){ renderCameraPermUI(); });
          } else if (result === 'denied') {
            toast('❌ Bạn đã từ chối. Xem hướng dẫn bên dưới.');
            renderCameraPermUI();
          } else if (result === 'no-device') {
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
    if (sel) {
      sel.addEventListener('change', function(){
        camState.selectedDeviceId = this.value;
        if (camState.stream) {
          camState.stream.getTracks().forEach(function(t){ t.stop(); });
          camState.stream = null;
          state.stream = null;
          startCameraStream();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    setTimeout(doInit, 100);
  }
}

function startCameraStream(){
  if (!isCameraSupported()) { toast('Trình duyệt không hỗ trợ camera.'); return; }
  if (camState.stream) return;
  var constraints = {
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };
  if (camState.selectedDeviceId) constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream){
      camState.stream = stream;
      state.stream = stream;
      $('video').srcObject = stream;
      $('captureBtn').disabled = false;
      // Đổi nút Bật → Tắt
      var btn = $('startCam');
      btn.innerHTML = '<span class="action-icon">⏹️</span><span class="action-label">Tắt Camera</span><span class="action-hint">Đang bật</span>';
      btn.classList.remove('primary');
      btn.classList.add('danger-action');
      toast('✅ Camera đã bật');
    })
    .catch(function(err){
      if (err.name === 'NotAllowedError') {
        camState.permission = 'denied';
        renderCameraPermUI();
        toast('❌ Bạn đã chặn camera. Xem hướng dẫn bên dưới.');
      } else if (err.name === 'NotFoundError') {
        toast('⚠️ Không tìm thấy camera');
      } else {
        toast('❌ Lỗi camera: ' + err.message);
      }
    });
}

function stopCameraStream(){
  if (camState.stream) {
    camState.stream.getTracks().forEach(function(t){ t.stop(); });
    camState.stream = null;
    state.stream = null;
    if ($('startCam')) {
      var btn = $('startCam');
      btn.innerHTML = '<span class="action-icon">🎥</span><span class="action-label">Bật Camera</span><span class="action-hint">Máy này</span>';
      btn.classList.add('primary');
      btn.classList.remove('danger-action');
      btn.disabled = camState.permission !== 'granted';
    }
    if ($('captureBtn')) $('captureBtn').disabled = true;
  }
}

$('startCam').addEventListener('click', function(){
  if (camState.stream) { stopCameraStream(); return; }
  startCameraStream();
});

$('captureBtn').addEventListener('click', function(){
  var video = $('video');
  if (!video.videoWidth) { toast('Camera chưa sẵn sàng'); return; }
  var canvas = $('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  loadImageFromDataUrl(dataUrl);
});

/* ============================================================
   LOAD ẢNH
   ============================================================ */
function loadImageFromDataUrl(dataUrl){
  var img=new Image();
  img.onload=function(){
    state.image=img;
    var tc=document.createElement('canvas');
    var maxSize=400;
    var scale=Math.min(maxSize/img.width, maxSize/img.height, 1);
    tc.width=img.width*scale;
    tc.height=img.height*scale;
    tc.getContext('2d').drawImage(img,0,0,tc.width,tc.height);
    state.imageThumb=tc.toDataURL('image/jpeg',0.7);
    goStep(2);
    initCropSelector();
  };
  img.src=dataUrl;
}

function handleFile(e){
  var file=e.target.files[0];
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    showTab('scan');
    setTimeout(function(){loadImageFromDataUrl(ev.target.result);},100);
  };
  reader.readAsDataURL(file);
  e.target.value='';
}
$('fileScan').addEventListener('change',handleFile);
$('fileHome').addEventListener('change',handleFile);

/* ============================================================
   STEPS
   ============================================================ */
function goStep(n){
  $('step1').style.display=(n===1)?'block':'none';
  $('stepCrop').style.display=(n===2)?'block':'none';
  $('step2').style.display=(n===3)?'block':'none';
  $('step4').style.display=(n===4)?'block':'none';
  var steps=document.querySelectorAll('.step');
  for(var i=0;i<steps.length;i++)steps[i].classList.toggle('active',i<n);
  window.scrollTo({top:0,behavior:'smooth'});
}
function resetScan(){
  state.image=null;state.pickedRGB=null;state.pickedRGBCorrected=null;
  state.currentPH=null;state.imageDataFull=null;state.whiteBalance=null;
  var box = $('receivedPhotoBox');
  if (box) { box.style.display = 'none'; box.dataset.dataUrl = ''; }
  clearInterval(autoStepTimer);
  if(typeof cropState !== 'undefined'){
    cropState.hasSelection = false;
    cropState.isDragging = false;
  }
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
  if (!canvas) return;

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
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);

  if (cropState.hasSelection && !cropState.isDragging) {
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
    for (var i = 1; i < 3; i++) {
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
  } else if (cropState.isDragging) {
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

function cropMouseUp(e){
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

  if (w < 30 || h < 30) {
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
  if(!cropState.hasSelection) {
    toast('Chưa chọn vùng nào');
    return;
  }

  var x1 = Math.min(cropState.startX, cropState.endX) / cropState.scale;
  var y1 = Math.min(cropState.startY, cropState.endY) / cropState.scale;
  var x2 = Math.max(cropState.startX, cropState.endX) / cropState.scale;
  var y2 = Math.max(cropState.startY, cropState.endY) / cropState.scale;
  var w = x2 - x1;
  var h = y2 - y1;

  var cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.round(w);
  cropCanvas.height = Math.round(h);
  var cctx = cropCanvas.getContext('2d');
  cctx.drawImage(state.image, x1, y1, w, h, 0, 0, cropCanvas.width, cropCanvas.height);

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
  if (btnConfirm) btnConfirm.addEventListener('click', confirmCrop);

  var btnReset = $('resetCropBtn');
  if (btnReset) btnReset.addEventListener('click', resetCropSelection);

  var btnSkip = $('skipCropBtn');
  if (btnSkip) btnSkip.addEventListener('click', skipCrop);
});

/* ============================================================
   CROP CANVAS — Chọn màu
   ============================================================ */
function drawCropCanvas(){
  if(!state.image)return;
  var c=$('cropCanvas');
  var ctx=c.getContext('2d');
  var maxW=Math.min(window.innerWidth-40,620);
  var scale=Math.min(maxW/state.image.width,1);
  c.width=Math.round(state.image.width*scale);
  c.height=Math.round(state.image.height*scale);
  ctx.drawImage(state.image,0,0,c.width,c.height);
  state.imageDataFull=ctx.getImageData(0,0,c.width,c.height);
  state.whiteBalance=autoWhiteBalance(state.imageDataFull);
  pickColor(c.width/2, c.height/2);
}

function pickColor(x,y){
  if(!state.imageDataFull)return;
  var imgData=state.imageDataFull;
  var sampled=sampleColors(imgData, Math.round(x), Math.round(y), 5);
  if(!sampled.count){toast('Không lấy được mẫu màu');return;}
  state.pickedRGB={r:sampled.r, g:sampled.g, b:sampled.b};
  var wb=state.whiteBalance;
  var corr={
    r: Math.max(0, Math.min(255, Math.round(sampled.r*wb.scaleR))),
    g: Math.max(0, Math.min(255, Math.round(sampled.g*wb.scaleG))),
    b: Math.max(0, Math.min(255, Math.round(sampled.b*wb.scaleB)))
  };
  state.pickedRGBCorrected=corr;
  state.pickedHSV=rgb2hsv(corr.r, corr.g, corr.b);
  state.pickedLab=rgb2lab(corr.r, corr.g, corr.b);
  $('pickPos').textContent='('+Math.round(x)+', '+Math.round(y)+') · '+sampled.count+' mẫu';
  $('rgbVal').textContent=sampled.r+', '+sampled.g+', '+sampled.b;
  $('rgbCorr').textContent=corr.r+', '+corr.g+', '+corr.b;
  $('hsvVal').textContent=state.pickedHSV.h+'°, '+state.pickedHSV.s+'%, '+state.pickedHSV.v+'%';
  $('swatch').style.background='rgb('+corr.r+','+corr.g+','+corr.b+')';
}

$('cropCanvas').addEventListener('click',function(e){
  var rect=e.target.getBoundingClientRect();
  var x=(e.clientX-rect.left)*(e.target.width/rect.width);
  var y=(e.clientY-rect.top)*(e.target.height/rect.height);
  pickColor(x,y);
});

/* ============================================================
   ANALYZE
   ============================================================ */
function analyze(){
  if(!state.pickedRGBCorrected){toast('Chưa chọn màu!');return;}
  var result=estimatePHAdvanced(state.pickedRGBCorrected, state.pickedRGB);
  var ph=result.ph;
  var info=classifyPH(ph);
  state.currentPH=ph;
  state.currentStatus=info;
  state.currentConfidence=result.confidence;
  state.currentDE=result.bestDE;
  state.currentRefMatch=result.refMatch;
  state.currentLab=result.lab;

  var phEl = $('phValue');
  var targetPH = ph;
  var duration = 900;
  var startTime = performance.now();
  function tick(now){
    var p = Math.min((now - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - p, 3);
    phEl.textContent = (targetPH * eased).toFixed(1);
    if (p < 1) requestAnimationFrame(tick);
    else phEl.textContent = targetPH.toFixed(1);
  }
  requestAnimationFrame(tick);

  $('phStatus').textContent='Đất '+info.status;
  $('phStatus').className='status-badge '+info.cls;

  var conf=result.confidence;
  var confColor = conf>=80?'#10b981' : conf>=60?'#f59e0b' : '#ef4444';
  $('confFill').style.width=conf+'%';
  $('confFill').style.background='linear-gradient(90deg,'+confColor+','+confColor+'cc)';
  $('confTxt').textContent=conf+'% · '+(conf>=80?'Rất tốt':conf>=60?'Khá tốt':conf>=40?'Trung bình':'Thấp — nên đo lại');

  $('r3').textContent=state.pickedRGB.r+', '+state.pickedRGB.g+', '+state.pickedRGB.b;
  $('rgbCorr3').textContent=state.pickedRGBCorrected.r+', '+state.pickedRGBCorrected.g+', '+state.pickedRGBCorrected.b;
  $('h3').textContent=state.pickedHSV.h+'°, '+state.pickedHSV.s+'%, '+state.pickedHSV.v+'%';
  $('lab3').textContent='L:'+result.lab.L.toFixed(1)+' a:'+result.lab.a.toFixed(1)+' b:'+result.lab.b.toFixed(1);
  $('de3').textContent=result.bestDE.toFixed(1);
  $('refMatch').textContent='pH '+result.refMatch.ph;

  $('recommend').innerHTML = buildRecommendation(ph, result.confidence, result.lab, result.bestDE, result.refMatch);

  goStep(4);

  if (conf >= 80) {
    setTimeout(function(){
      for (var i = 0; i < 12; i++) {
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
}

/* ============================================================
   PHƯƠNG ÁN CẢI TẠO CHI TIẾT
   ============================================================ */
function buildRecommendation(ph, confidence, lab, bestDE, refMatch){
  var group, groupIcon, groupColor, groupTitle;
  if (ph < 5.0) {
    group = 'very-acid';
    groupIcon = '🚨';
    groupColor = '#dc2626';
    groupTitle = 'ĐẤT CHUA GẮT';
  } else if (ph < 5.5) {
    group = 'acid';
    groupIcon = '⚠️';
    groupColor = '#ea580c';
    groupTitle = 'ĐẤT CHUA';
  } else if (ph <= 6.5) {
    group = 'optimal';
    groupIcon = '✅';
    groupColor = '#10b981';
    groupTitle = 'ĐẤT TỐI ƯU';
  } else if (ph <= 7.2) {
    group = 'slightly-alkaline';
    groupIcon = '🟡';
    groupColor = '#f59e0b';
    groupTitle = 'ĐẤT HƠI KIỀM';
  } else {
    group = 'alkaline';
    groupIcon = '🔵';
    groupColor = '#3b82f6';
    groupTitle = 'ĐẤT KIỀM';
  }

  var targetPH = 5.8;
  var deltaPH = Math.max(0, targetPH - ph);
  var limePerTree = 0;
  var limePerM2 = 0;
  if (deltaPH > 0) {
    limePerM2 = deltaPH * 0.1;
    limePerTree = deltaPH * 5;
  }

  var html = '';
  html += '<h4 style="margin:0 0 12px;color:' + groupColor + ';font-size:1.1rem">';
  html += groupIcon + ' ' + groupTitle + ' — pH ' + ph.toFixed(1);
  html += '</h4>';

  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid ' + groupColor + '">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:6px">🔍 Chẩn đoán</div>';
  html += '<div style="font-size:.85rem;line-height:1.6">';

  if (group === 'very-acid') {
    html += 'pH <b>quá thấp</b> — cây sầu riêng không hấp thu được <b>lân (P)</b>, <b>canxi (Ca)</b>, <b>magie (Mg)</b>. ';
    html += '<b>Nấm Phytophthora</b> phát triển mạnh → nguy cơ <b>xì mủ, nứt thân</b> rất cao. ';
    html += '<b>Nhôm (Al³⁺)</b> và <b>sắt (Fe²⁺)</b> gây độc rễ, cây còi cọc, rụng lá non.';
  } else if (group === 'acid') {
    html += 'pH <b>hơi thấp</b> so với ngưỡng tối ưu (5.5–6.5) của sầu riêng. ';
    html += 'Cây vẫn sinh trưởng được nhưng <b>hiệu quả hấp thu dinh dưỡng giảm</b>, dễ bị nấm bệnh khi mưa nhiều.';
  } else if (group === 'optimal') {
    html += 'pH <b>nằm trong khoảng lý tưởng</b> cho sầu riêng (5.5–6.5). ';
    html += 'Cây hấp thu dinh dưỡng tốt, rễ khỏe, ít bị nấm <i>Phytophthora</i>. ';
    html += 'Không cần cải tạo gấp — chỉ cần <b>duy trì</b> ổn định.';
  } else if (group === 'slightly-alkaline') {
    html += 'pH <b>hơi cao</b>. Một số vi chất như <b>sắt (Fe)</b>, <b>kẽm (Zn)</b>, <b>mangan (Mn)</b> bị kết tủa, ';
    html += 'cây có thể vàng lá non (do thiếu Fe).';
  } else {
    html += 'pH <b>kiềm rõ rệt</b>. Nhiều vi chất bị khóa hoàn toàn. ';
    html += '<b>Canxi dư thừa</b> gây đối kháng với K, Mg, Fe. Cây còi, lá vàng, năng suất giảm mạnh.';
  }
  html += '</div></div>';

  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid #f59e0b">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:8px">🛠️ Phương án cải tạo</div>';

  if (group === 'very-acid') {
    html += '<div style="font-size:.85rem;line-height:1.7">';
    html += '<b>1️⃣ Bón vôi CaCO₃ hoặc Dolomite (có Mg):</b><br>';
    html += '&nbsp;&nbsp;• Liều lượng: <b>~' + Math.round(limePerM2*10)/10 + ' kg/m²</b> (tương đương <b>~' + Math.round(limePerTree*10)/10 + ' kg/gốc</b>)<br>';
    html += '&nbsp;&nbsp;• Chia <b>3 đợt</b>, cách nhau <b>4 tuần</b><br>';
    html += '&nbsp;&nbsp;• Rải quanh tán, cách gốc <b>0.5–1 m</b>, xới nhẹ cho vôi thấm<br>';
    html += '&nbsp;&nbsp;• <b>KHÔNG bón cùng phân hóa học</b> — cách ít nhất 15 ngày<br><br>';
    html += '<b>2️⃣ Bổ sung hữu cơ:</b> 20–30 kg phân chuồng hoai + 1–2 kg vôi bột/gốc/năm<br><br>';
    html += '<b>3️⃣ Xử lý nấm Phytophthora:</b> Tưới <b>Metalaxyl + Mancozeb</b> quanh gốc, cách 2 tuần/lần × 3 lần<br><br>';
    html += '<b>4️⃣ Che phủ đất:</b> Rơm rạ, cỏ khô giữ ẩm, hạn chế rửa trôi<br>';
    html += '</div>';
  } else if (group === 'acid') {
    html += '<div style="font-size:.85rem;line-height:1.7">';
    html += '<b>1️⃣ Bón vôi nâng pH lên 5.8:</b><br>';
    html += '&nbsp;&nbsp;• Liều lượng: <b>~' + Math.round(limePerM2*10)/10 + ' kg/m²</b> (tương đương <b>~' + Math.round(limePerTree*10)/10 + ' kg/gốc</b>)<br>';
    html += '&nbsp;&nbsp;• Chia <b>2 đợt</b>, cách nhau <b>3–4 tuần</b><br>';
    html += '&nbsp;&nbsp;• Ưu tiên <b>vôi Dolomite</b> nếu đất thiếu Mg<br><br>';
    html += '<b>2️⃣ Tăng hữu cơ:</b> 15–20 kg phân chuồng hoai/gốc/năm<br><br>';
    html += '<b>3️⃣ Bón phân cân đối:</b> Ưu tiên lân nung chảy, kali sulfate thay vì clorua<br><br>';
    html += '<b>4️⃣ Đo lại pH:</b> Sau <b>2 tháng</b> để kiểm tra hiệu quả<br>';
    html += '</div>';
  } else if (group === 'optimal') {
    html += '<div style="font-size:.85rem;line-height:1.7">';
    html += '<b>1️⃣ Duy trì ổn định:</b><br>';
    html += '&nbsp;&nbsp;• Bón hữu cơ hoai mục <b>2–3 tháng/lần</b><br>';
    html += '&nbsp;&nbsp;• Không bón vôi, không bón vôi bột<br><br>';
    html += '<b>2️⃣ Kiểm soát nước:</b> Tránh ngập úng mùa mưa — đào rãnh thoát<br><br>';
    html += '<b>3️⃣ Bổ sung vi sinh:</b> <b>Trichoderma</b> + <b>Bacillus</b> 2 lần/năm phòng nấm<br><br>';
    html += '<b>4️⃣ Đo lại pH:</b> Mỗi <b>3–6 tháng</b> để phát hiện sớm bất thường<br>';
    html += '</div>';
  } else if (group === 'slightly-alkaline') {
    html += '<div style="font-size:.85rem;line-height:1.7">';
    html += '<b>1️⃣ Hạ pH bằng hữu cơ chua:</b><br>';
    html += '&nbsp;&nbsp;• Bón <b>phân chuồng hoai + rơm rạ + vỏ cà phê</b><br>';
    html += '&nbsp;&nbsp;• Hoặc dùng <b>lưu huỳnh nguyên tố (S)</b>: 50–100 g/gốc<br><br>';
    html += '<b>2️⃣ Bổ sung vi chất dạng chelate:</b><br>';
    html += '&nbsp;&nbsp;• <b>Fe-EDDHA</b> (sắt chelate) phun lá hoặc tưới gốc<br>';
    html += '&nbsp;&nbsp;• <b>Zn-EDTA</b>, <b>Mn-EDTA</b> nếu cây vàng lá<br><br>';
    html += '<b>3️⃣ Ngưng bón vôi và phân có Ca cao:</b> Đá vôi, vỏ trứng, DAP...<br><br>';
    html += '<b>4️⃣ Đo lại pH</b> sau <b>2–3 tháng</b><br>';
    html += '</div>';
  } else {
    html += '<div style="font-size:.85rem;line-height:1.7">';
    html += '<b>1️⃣ Hạ pH mạnh bằng lưu huỳnh:</b><br>';
    html += '&nbsp;&nbsp;• <b>Lưu huỳnh nguyên tố (S)</b>: 100–200 g/gốc/năm, chia 2 đợt<br>';
    html += '&nbsp;&nbsp;• Hoặc <b>thạch cao (CaSO₄)</b> nếu đất mặn<br><br>';
    html += '<b>2️⃣ Bổ sung hữu cơ lớn:</b> 30–50 kg phân chuồng hoai + 5 kg rơm rạ/gốc<br><br>';
    html += '<b>3️⃣ Vi chất chelate:</b> Fe-EDDHA, Zn-EDTA, Mn-EDTA — bắt buộc dùng<br><br>';
    html += '<b>4️⃣ Kiểm tra nước tưới:</b> Nếu nước có CaCO₃ cao → cần lọc/trữ trước khi tưới<br><br>';
    html += '<b>5️⃣ Đo lại pH</b> mỗi <b>2 tháng</b><br>';
    html += '</div>';
  }
  html += '</div>';

  html += '<div style="background:#fff;padding:12px;border-radius:8px;margin-bottom:10px;border-left:4px solid #3b82f6">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:8px">📅 Lịch trình đề xuất</div>';
  html += '<div style="font-size:.85rem;line-height:1.7">';

  if (group === 'very-acid' || group === 'acid') {
    html += '<b>Tuần 1:</b> Bón đợt 1 vôi + rải hữu cơ quanh tán<br>';
    html += '<b>Tuần 3:</b> Tưới nấm Phytophthora (nếu có triệu chứng xì mủ)<br>';
    html += '<b>Tuần 5:</b> Bón đợt 2 vôi<br>';
    if (group === 'very-acid') html += '<b>Tuần 9:</b> Bón đợt 3 vôi<br>';
    html += '<b>Tuần 8–10:</b> <b>Đo lại pH</b> kiểm tra kết quả<br>';
    html += '<b>Tuần 12:</b> Bổ sung vi sinh Trichoderma + Bacillus<br>';
  } else if (group === 'optimal') {
    html += '<b>Hàng tháng:</b> Kiểm tra ẩm độ, rãnh thoát nước<br>';
    html += '<b>Mỗi 2–3 tháng:</b> Bón hữu cơ hoai mục<br>';
    html += '<b>Mỗi 3–6 tháng:</b> Đo pH đất<br>';
    html += '<b>Mỗi 6 tháng:</b> Bổ sung vi sinh phòng nấm<br>';
  } else {
    html += '<b>Tuần 1:</b> Bón hữu cơ chua (rơm, vỏ cà phê) + lưu huỳnh đợt 1<br>';
    html += '<b>Tuần 4:</b> Phun vi chất chelate (Fe-EDDHA, Zn-EDTA)<br>';
    html += '<b>Tuần 8:</b> Bón lưu huỳnh đợt 2 (nếu pH còn cao)<br>';
    html += '<b>Tuần 8–10:</b> <b>Đo lại pH</b><br>';
    html += '<b>Tuần 12:</b> Đánh giá lại toàn bộ<br>';
  }
  html += '</div></div>';

  html += '<div style="background:#fef3c7;padding:12px;border-radius:8px;border-left:4px solid #f59e0b">';
  html += '<div style="font-weight:700;font-size:.9rem;margin-bottom:6px">⚠️ Lưu ý quan trọng</div>';
  html += '<div style="font-size:.82rem;line-height:1.7">';

  if (group === 'very-acid' || group === 'acid') {
    html += '• <b>Không bón vôi cùng phân hóa học</b> — cách ít nhất 15 ngày<br>';
    html += '• <b>Không bón vôi khi đất quá ẩm</b> — dễ gây sốc rễ<br>';
    html += '• Rải vôi <b>đều quanh tán</b>, không đổ vào gốc<br>';
    html += '• Sau khi bón vôi cần <b>tưới nhẹ</b> để vôi tan<br>';
    html += '• Vôi Dolomite tốt hơn vôi nông nghiệp thường (có Mg)<br>';
  } else if (group === 'optimal') {
    html += '• <b>Không bón vôi</b> khi không cần — dư Ca gây mất cân đối<br>';
    html += '• Kiểm tra pH định kỳ để phát hiện sớm biến động<br>';
    html += '• Hữu cơ hoai mục là "thức ăn chính" — đừng bỏ qua<br>';
  } else {
    html += '• <b>Lưu huỳnh (S)</b> cần <b>vi sinh vật</b> chuyển hóa — đất phải có hữu cơ<br>';
    html += '• <b>Không dùng axit mạnh</b> trực tiếp — gây chết rễ<br>';
    html += '• Vi chất chelate (EDDHA/EDTA) <b>không bị kết tủa</b> ở pH cao<br>';
    html += '• Kiểm tra nguồn nước tưới — nếu có CaCO₃ cao phải xử lý trước<br>';
  }
  html += '</div></div>';

  var confLabel = confidence >= 80 ? '🟢 Cao' : confidence >= 60 ? '🟡 Khá' : confidence >= 40 ? '🟠 Trung bình' : '🔴 Thấp';
  html += '<div style="background:#eff6ff;padding:10px;border-radius:8px;border-left:4px solid #3b82f6;font-size:.8rem;margin-top:10px">';
  html += '<b>📊 Chất lượng phân tích:</b> ' + confLabel + ' (' + confidence + '%) · ';
  html += 'Màu gần nhất: <b>pH ' + refMatch.ph + '</b> · ΔE = ' + bestDE.toFixed(1);
  if (confidence < 60) {
    html += '<br><span style="color:#dc2626">⚠️ Độ tin cậy thấp — nên đo lại với ánh sáng tốt hơn hoặc dùng giấy quỳ mới.</span>';
  }
  html += '</div>';

  return html;
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  $('todayDate').textContent=new Date().toLocaleDateString('vi-VN',{
    weekday:'long',year:'numeric',month:'long',day:'numeric'
  });
}

/* ============================================================
   ONLINE/OFFLINE
   ============================================================ */
function updateStatus(){
  var el=$('onlineStatus');
  if(!el)return;
  var online=navigator.onLine;
  el.textContent=online?'● Online':'● Offline';
  el.style.background=online?'rgba(255,255,255,.2)':'rgba(239,68,68,.5)';
}
window.addEventListener('online',updateStatus);
window.addEventListener('offline',updateStatus);

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
  for (var i = 0; i < len; i++) s += chars[arr[i] % chars.length];
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
  if (!el) return;
  el.className = '';
  if (status === 'connected') {
    el.textContent = 'WS: đã kết nối';
    el.classList.add('connected');
  } else if (status === 'connecting') {
    el.textContent = 'WS: đang kết nối...';
    el.classList.add('connecting');
  } else {
    el.textContent = 'WS: chưa kết nối';
    el.classList.add('disconnected');
  }
}

function openQRPanel(){
  if (isFileProtocol()) {
    toast('⚠️ Đang mở file:// — QR chỉ mở được trên máy này.');
  }
  $('qrPanel').style.display = 'block';
  createQRToken();
  connectHostWebSocket();
}

function createQRToken(){
  wsState.roomId = 'durian_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  wsState.token = makeToken(16);
  wsState.expiresAt = Date.now() + 3*60*1000;
  wsState.photoReceived = false;

  var box = $('receivedPhotoBox');
  if (box) { box.style.display = 'none'; box.dataset.dataUrl = ''; }
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
  } catch(e) {
    boxQR.innerHTML = '<div style="color:#ef4444;font-size:.85rem">Không tạo được QR.<br>'+url+'</div>';
  }

  var urlBox = document.getElementById('qrUrlDisplay');
  if (!urlBox) {
    urlBox = document.createElement('div');
    urlBox.id = 'qrUrlDisplay';
    urlBox.style.cssText = 'font-size:.72rem;color:#6b7280;margin-top:8px;word-break:break-all;background:#f9fafb;padding:6px;border-radius:6px';
    boxQR.parentNode.appendChild(urlBox);
  }
  urlBox.textContent = url;

  stopQRTimer();
  wsState.timer = setInterval(function(){
    var left = wsState.expiresAt - Date.now();
    if (left <= 0) {
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
  if (wsState.timer) { clearInterval(wsState.timer); wsState.timer = null; }
}

function connectHostWebSocket(){
  if (wsState.socket) {
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
  } catch(e) {
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
    } catch(e) {
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
    if (wsState.mode === 'host' && $('qrPanel') && $('qrPanel').style.display !== 'none') {
      $('qrStatus').innerHTML = '⚠️ Mất kết nối WebSocket. Bấm <b>Tạo mã mới</b> để thử lại.';
    }
  };
}

function handleHostMessage(msg){
  if (!msg) return;

  var type = msg.type || msg.event;
  var data = msg.data || msg.payload || msg;

  if (msg.token && msg.token !== wsState.token) return;
  if (Date.now() > wsState.expiresAt) {
    $('qrStatus').textContent = '❌ Mã đã hết hạn.';
    return;
  }

  if (type === 'hello') {
    $('qrStatus').innerHTML = '📱 <b style="color:#10b981">Điện thoại đã kết nối!</b> Đang chờ ảnh...';
  } else if (type === 'photo') {
    if (wsState.photoReceived) return;
    wsState.photoReceived = true;

    var dataUrl = data.dataUrl || data.photo || data;
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return;

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
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(autoStepTimer);
      useReceivedPhoto();
    }
  }, 1000);
}

function useReceivedPhoto(){
  clearInterval(autoStepTimer);
  var box = $('receivedPhotoBox');
  var dataUrl = box.dataset.dataUrl;
  if (!dataUrl) { toast('Không có ảnh để dùng'); return; }
  box.style.display = 'none';
  loadImageFromDataUrl(dataUrl);
}

function cancelAutoStep(){
  clearInterval(autoStepTimer);
  var box = $('receivedPhotoBox');
  if (box) box.style.display = 'none';
}

function fmtTime(ms){
  if (ms < 0) ms = 0;
  var s = Math.floor(ms/1000);
  var m = Math.floor(s/60);
  s = s % 60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
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
    if (el) el.textContent = t;
  }

  function setMsg(t, color){
    var el = document.getElementById('phoneMsg');
    el.textContent = t;
    el.style.background = color === 'err' ? '#fef2f2' : color === 'ok' ? '#ecfdf5' : '#fffbeb';
    el.style.borderLeftColor = color === 'err' ? '#ef4444' : color === 'ok' ? '#10b981' : '#f59e0b';
  }

  function setWsStatus(t, color){
    var el = document.getElementById('phoneWsStatus');
    if (!el) return;
    el.textContent = t;
    if (color === 'ok') { el.style.background = '#d1fae5'; el.style.color = '#065f46'; }
    else if (color === 'err') { el.style.background = '#fee2e2'; el.style.color = '#991b1b'; }
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
  } catch(e) {
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
    } catch(e) {
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
    if (stream) { stream.getTracks().forEach(function(t){t.stop();}); stream = null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermStatus('🔴 Đã bị chặn', '#ef4444');
          setMsg('❌ Bạn đã từ chối quyền camera.', 'err');
        } else if (err.name === 'NotFoundError') {
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
    if (!v.videoWidth) { setMsg('Camera chưa sẵn sàng.', 'err'); return; }
    if (!wsState.socket || wsState.socket.readyState !== WebSocket.OPEN) {
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
    } catch(e) {
      setMsg('❌ Lỗi gửi: ' + e.message, 'err');
      dbg('LỖI: ' + e.message);
    }
  });

  document.getElementById('pSwitch').addEventListener('click', function(){
    facing = facing === 'environment' ? 'user' : 'environment';
    startCam();
  });

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'camera' }).then(function(st){
      if (st.state === 'granted') {
        setPermStatus('🟢 Đã cấp quyền', '#10b981');
        startCam();
      } else if (st.state === 'denied') {
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
$('qrConnectBtn').addEventListener('click', openQRPanel);
$('qrRenewBtn').addEventListener('click', function(){
  createQRToken();
  connectHostWebSocket();
  toast('🔄 Đã tạo mã QR mới');
});
$('qrCloseBtn').addEventListener('click', function(){
  stopQRTimer();
  if (wsState.socket && wsState.mode === 'host') {
    try { wsState.socket.close(); } catch(e){}
  }
  $('qrPanel').style.display = 'none';
});

(function bindReceivedPhotoButtons(){
  var btnUse = $('useReceivedPhotoBtn');
  if (btnUse) btnUse.addEventListener('click', useReceivedPhoto);

  var btnRetake = $('retakePhotoBtn');
  if (btnRetake) {
    btnRetake.addEventListener('click', function(){
      cancelAutoStep();
      var box = $('receivedPhotoBox');
      if (box) { box.style.display = 'none'; box.dataset.dataUrl = ''; }
      openQRPanel();
      toast('🔄 Mở lại QR');
    });
  }
})();

(function checkPhoneMode(){
  var params = new URLSearchParams(location.search);
  var roomId = params.get('room');
  var token = params.get('token');

  if (roomId) {
    if (document.readyState === 'loading') {
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
