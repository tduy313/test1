/* ============================================================
   HELPERS
   ============================================================ */
function $(id){return document.getElementById(id);}
function toast(msg){
  var t=$('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('show');},2200);
}
function escapeHtml(s){
  if(!s)return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  function inv(c){
    c=c/255;
    return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  }
  var R=inv(r)*100, G=inv(g)*100, B=inv(b)*100;
  return {
    x: R*0.4124564 + G*0.3575761 + B*0.1804375,
    y: R*0.2126729 + G*0.7151522 + B*0.0721750,
    z: R*0.0193339 + G*0.1191920 + B*0.9503041
  };
}

function xyz2lab(x,y,z){
  var Xn=95.047, Yn=100.000, Zn=108.883;
  function f(t){
    return t>0.008856 ? Math.pow(t,1/3) : (7.787*t + 16/116);
  }
  var fx=f(x/Xn), fy=f(y/Yn), fz=f(z/Zn);
  return {
    L: 116*fy - 16,
    a: 500*(fx - fy),
    b: 200*(fy - fz)
  };
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

/* ============================================================
   AUTO WHITE BALANCE - Gray World
   ============================================================ */
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

/* ============================================================
   LẤY MẪU 5x5 VÀ LỌC OUTLIER
   ============================================================ */
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
  return{
    r:Math.round(sumR/cnt),
    g:Math.round(sumG/cnt),
    b:Math.round(sumB/cnt),
    count:cnt
  };
}

/* ============================================================
   pH ESTIMATION
   ============================================================ */
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
  if(name==='log')renderLog();
  if(name==='admin'){renderRefGrid();renderSamples();loadCoef();}
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
   CAMERA PERMISSION MANAGER
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
          if (status.state === 'granted') {
            enumerateCameras();
          }
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
        if (camState.devices.length) {
          camState.selectedDeviceId = camState.devices[0].deviceId;
        }
      }
      var row = $('camDeviceRow');
      if (row) {
        row.style.display = camState.devices.length > 1 ? 'block' : 'none';
      }
      return camState.devices;
    })
    .catch(function(){ return []; });
}

function requestCameraPermission(){
  return new Promise(function(resolve, reject){
    if (!isCameraSupported()) {
      reject(new Error('Trình duyệt không hỗ trợ camera.'));
      return;
    }
    var constraints = { video: true, audio: false };
    if (camState.selectedDeviceId) {
      constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
    }
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
        } else {
          reject(err);
        }
      });
  });
}

function getPermissionHelpText(){
  var ua = navigator.userAgent.toLowerCase();
  var isMobile = /android|iphone|ipad|ipod/.test(ua);
  if (/chrome/.test(ua) && !isMobile) {
    return '<b>🔴 Camera đã bị chặn trên Chrome</b><br>' +
      'Bấm vào <b>biểu tượng 🔒 hoặc ⚠️</b> bên trái thanh địa chỉ → chọn <b>Site settings / Cài đặt trang</b> → ' +
      'mục <b>Camera</b> → chọn <b>Allow / Cho phép</b> → tải lại trang (F5).';
  }
  if (/chrome/.test(ua) && isMobile) {
    return '<b>🔴 Camera đã bị chặn trên Chrome Mobile</b><br>' +
      'Bấm <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Permissions / Quyền</b> → <b>Camera</b> → <b>Allow</b> → tải lại trang.';
  }
  if (/safari/.test(ua)) {
    return '<b>🔴 Camera đã bị chặn trên Safari</b><br>' +
      'Vào <b>Cài đặt (Settings)</b> → <b>Safari</b> → <b>Camera</b> → chọn <b>Allow / Hỏi / Cho phép</b>. ' +
      'Hoặc vào <b>Cài đặt → Quyền riêng tư → Camera</b> → bật cho Safari.';
  }
  if (/firefox/.test(ua)) {
    return '<b>🔴 Camera đã bị chặn trên Firefox</b><br>' +
      'Bấm vào <b>biểu tượng 🔒</b> trên thanh địa chỉ → <b>Xóa quyền / Clear permission</b> → tải lại trang (F5) → bấm <b>Allow</b> khi được hỏi.';
  }
  if (/edg/.test(ua)) {
    return '<b>🔴 Camera đã bị chặn trên Edge</b><br>' +
      'Bấm <b>biểu tượng 🔒</b> → <b>Permissions for this site</b> → <b>Camera</b> → <b>Allow</b> → tải lại trang.';
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
    status.innerHTML = 'Camera đã sẵn sàng sử dụng.';
  } else if (camState.permission === 'prompt' || camState.permission === 'unknown') {
    badgeClass += 'prompt';
    badgeText = '<span class="' + badgeClass + '">🟡 Chưa cấp quyền</span>';
    if (help) help.style.display = 'none';
    if (btnReq) { btnReq.textContent = '🔐 Cấp quyền Camera'; btnReq.disabled = false; }
    status.innerHTML = 'Bấm nút bên phải để cấp quyền.' + badgeText;
  } else if (camState.permission === 'denied') {
    badgeClass += 'denied';
    badgeText = '<span class="' + badgeClass + '">🔴 Đã bị chặn</span>';
    if (help) {
      help.style.display = 'block';
      if (helpText) helpText.innerHTML = getPermissionHelpText();
    }
    if (btnReq) { btnReq.textContent = '🔁 Thử lại'; btnReq.disabled = false; }
    status.innerHTML = 'Camera đang bị chặn.' + badgeText;
  } else if (camState.permission === 'unsupported') {
    badgeClass += 'unsupported';
    badgeText = '<span class="' + badgeClass + '">⚪ Không hỗ trợ</span>';
    if (btnReq) { btnReq.textContent = '❌ Không hỗ trợ'; btnReq.disabled = true; }
    status.innerHTML = 'Trình duyệt không hỗ trợ camera.' + badgeText;
  }

  if (btnStart) btnStart.disabled = !canStart;
}

function initCameraPermission(){
  if (!isCameraSupported()) {
    camState.supported = false;
    camState.permission = 'unsupported';
    renderCameraPermUI();
    return;
  }
  queryCameraPermission().then(function(){
    renderCameraPermUI();
    if (camState.permission === 'granted') {
      enumerateCameras();
    }
    document.addEventListener('visibilitychange', function(){
      if (!document.hidden) {
        queryCameraPermission().then(function(){
          renderCameraPermUI();
          if (camState.permission === 'granted' && !camState.devices.length) {
            enumerateCameras();
          }
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

function startCameraStream(){
  if (!isCameraSupported()) {
    toast('Trình duyệt không hỗ trợ camera.');
    return;
  }
  if (camState.stream) return;

  var constraints = {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };
  if (camState.selectedDeviceId) {
    constraints.video = { deviceId: { exact: camState.selectedDeviceId } };
  }

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream){
      camState.stream = stream;
      state.stream = stream;
      $('video').srcObject = stream;
      $('captureBtn').disabled = false;
      $('startCam').textContent = '🎥 Camera ON (bấm để tắt)';
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
    if ($('startCam')) $('startCam').textContent = '🎥 Bật camera máy này';
    if ($('captureBtn')) $('captureBtn').disabled = true;
  }
}

$('startCam').addEventListener('click', function(){
  if (camState.stream) {
    stopCameraStream();
    return;
  }
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
    drawCropCanvas();
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
  $('step1').style.display=n===1?'block':'none';
  $('step2').style.display=n===2?'block':'none';
  $('step3').style.display=n===3?'block':'none';
  var steps=document.querySelectorAll('.step');
  for(var i=0;i<steps.length;i++)steps[i].classList.toggle('active',i<n);
  window.scrollTo({top:0,behavior:'smooth'});
}
function resetScan(){
  state.image=null;state.pickedRGB=null;state.pickedRGBCorrected=null;
  state.currentPH=null;state.imageDataFull=null;state.whiteBalance=null;
  goStep(1);
}

/* ============================================================
   CROP CANVAS + WHITE BALANCE
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

  $('phValue').textContent=ph.toFixed(1);
  $('phStatus').textContent='Đất '+info.status;
  $('phStatus').className='status-badge '+info.cls;

  var conf=result.confidence;
  var confColor = conf>=80?'#10b981' : conf>=60?'#f59e0b' : '#ef4444';
  $('confFill').style.width=conf+'%';
  $('confFill').style.background=confColor;
  $('confTxt').textContent=conf+'% · '+(conf>=80?'Rất tốt':conf>=60?'Khá tốt':conf>=40?'Trung bình':'Thấp — nên đo lại');

  $('r3').textContent=state.pickedRGB.r+', '+state.pickedRGB.g+', '+state.pickedRGB.b;
  $('rgbCorr3').textContent=state.pickedRGBCorrected.r+', '+state.pickedRGBCorrected.g+', '+state.pickedRGBCorrected.b;
  $('h3').textContent=state.pickedHSV.h+'°, '+state.pickedHSV.s+'%, '+state.pickedHSV.v+'%';
  $('lab3').textContent='L:'+result.lab.L.toFixed(1)+' a:'+result.lab.a.toFixed(1)+' b:'+result.lab.b.toFixed(1);
  $('de3').textContent=result.bestDE.toFixed(1);
  $('refMatch').textContent='pH '+result.refMatch.ph;

  $('recommend').innerHTML=getRecommendation(ph);
  calcLime();
  goStep(3);
}

function getRecommendation(ph){
  if(ph<5.0)return '<b>⚠️ Đất chua gắt (pH '+ph.toFixed(1)+')</b><br>Bón vôi ngay để nâng pH lên 5.5–6.0. Chia 2–3 đợt cách 3–4 tuần. Rải quanh tán cách gốc 0.5 m.';
  if(ph<5.5)return '<b>🟡 Đất hơi chua (pH '+ph.toFixed(1)+')</b><br>Bón vôi nhẹ nâng lên 5.5–6.0. Chia 2 đợt cách 3 tuần. Kết hợp phân hữu cơ hoai mục.';
  if(ph<=6.5)return '<b>✅ Đất tối ưu cho sầu riêng (pH '+ph.toFixed(1)+')</b><br>Duy trì bón hữu cơ 2–3 tháng/lần. Không cần bón vôi.';
  return '<b>🔵 Đất hơi kiềm (pH '+ph.toFixed(1)+')</b><br>Bổ sung phân hữu cơ, rơm rạ, vỏ cà phê. Hạn chế phân gốc canxi.';
}

/* ============================================================
   LIME CALC
   ============================================================ */
function calcLime(){
  if(state.currentPH==null){return;}
  var area=Math.max(1,parseFloat($('areaInput').value)||0);
  var trees=Math.max(1,parseFloat($('treeInput').value)||1);
  var radius=Math.max(0.5,parseFloat($('radiusInput').value)||1);
  var ph=state.currentPH;
  var deltaPH=Math.max(0,5.8-ph);
  if(deltaPH===0){
    $('limeResult').innerHTML='<b>✅ Không cần bón vôi</b><br>pH hiện tại ('+ph.toFixed(1)+') đã đạt ngưỡng tối ưu.';
    return;
  }
  var totalLime=deltaPH*10*0.1*area;
  var perTree=totalLime/trees;
  var canopyArea=Math.PI*radius*radius;
  var perCanopy=canopyArea*deltaPH*10*0.1;
  $('limeResult').innerHTML=
    '<b>📊 Kết quả:</b><br>'+
    '• pH hiện tại: <b>'+ph.toFixed(1)+'</b> · Mục tiêu: <b>5.8</b><br>'+
    '• ΔpH cần nâng: <b>'+deltaPH.toFixed(1)+'</b><br>'+
    '• <b style="color:#047857;font-size:1.1rem">Tổng vôi CaCO₃: '+totalLime.toFixed(1)+' kg</b> cho '+area+' m²<br>'+
    '• <b>Lượng vôi/gốc:</b> '+perTree.toFixed(2)+' kg/gốc<br>'+
    '• <b>Lượng vôi/tán:</b> '+perCanopy.toFixed(2)+' kg<br>'+
    '<em style="color:#065f46">*Chia 2–3 đợt, cách 3–4 tuần.</em>';
}

/* ============================================================
   SAVE LOG
   ============================================================ */
$('saveFarm').addEventListener('change',function(){
  $('customFarmWrap').style.display=this.value==='Lô khác'?'block':'none';
});

function saveLog(){
  if(state.currentPH==null){toast('Chưa có kết quả!');return;}
  var farmSel=$('saveFarm');
  var farm=farmSel.value;
  if(farm==='Lô khác'){
    farm=$('customFarm').value.trim() || 'Lô chưa đặt tên';
  }
  var entry={
    id:Date.now(),
    time:new Date().toISOString(),
    farm:farm,
    ph:state.currentPH,
    status:state.currentStatus.status,
    confidence:state.currentConfidence,
    deltaE:state.currentDE,
    refMatchPH:state.currentRefMatch.ph,
    r:state.pickedRGB.r, g:state.pickedRGB.g, b:state.pickedRGB.b,
    rCorr:state.pickedRGBCorrected.r,
    gCorr:state.pickedRGBCorrected.g,
    bCorr:state.pickedRGBCorrected.b,
    lab:state.currentLab,
    temp:parseFloat($('saveTemp').value)||null,
    humidity:parseFloat($('saveHumidity').value)||null,
    note:$('saveNote').value.trim(),
    image:state.imageThumb
  };
  var logs=getLogs();
  logs.unshift(entry);
  try{
    localStorage.setItem('dsp_logs',JSON.stringify(logs));
    toast('✅ Đã lưu vào nhật ký!');
    resetScan();
    showTab('log');
  }catch(e){
    toast('❌ Lỗi lưu (có thể bộ nhớ đầy): '+e.message);
  }
}

function getLogs(){
  try{return JSON.parse(localStorage.getItem('dsp_logs'))||[];}
  catch(e){return[];}
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  $('todayDate').textContent=new Date().toLocaleDateString('vi-VN',{
    weekday:'long',year:'numeric',month:'long',day:'numeric'
  });
  var logs=getLogs();
  $('totalScans').textContent=logs.length;
  if(logs.length){
    var last=logs[0];
    $('lastPH').textContent=last.ph.toFixed(1);
    $('lastPHStatus').textContent=last.status+' · '+last.farm;
    $('lastPHStatus').style.color=classifyPH(last.ph).color;
  }
  var recent=logs.slice(0,5);
  var box=$('recentList');
  if(!recent.length){box.innerHTML='<p class="empty">Chưa có dữ liệu</p>';return;}
  var html='';
  for(var i=0;i<recent.length;i++){
    var l=recent[i];
    html+='<div class="recent-item" onclick="viewLog('+l.id+')"><div>'+
      '<div style="font-weight:700">'+escapeHtml(l.farm)+'</div>'+
      '<div class="muted" style="font-size:.75rem">'+new Date(l.time).toLocaleString('vi-VN')+'</div>'+
      '</div><div class="ph" style="color:'+classifyPH(l.ph).color+'">'+l.ph.toFixed(1)+'</div></div>';
  }
  box.innerHTML=html;
}

/* ============================================================
   LOG TAB
   ============================================================ */
function renderLog(){
  var logs=getLogs();
  var filter=$('filterVuon').value;
  var search=$('searchBox').value.trim().toLowerCase();
  var filtered=logs.filter(function(l){
    if(filter!=='all' && l.farm!==filter)return false;
    if(search){
      var text=(l.farm+' '+(l.note||'')).toLowerCase();
      if(text.indexOf(search)===-1)return false;
    }
    return true;
  });
  var farms={};
  for(var i=0;i<logs.length;i++)farms[logs[i].farm]=1;
  var sel=$('filterVuon');
  var cur=sel.value;
  sel.innerHTML='<option value="all">Tất cả vườn</option>';
  for(var f in farms){
    var o=document.createElement('option');
    o.value=f;o.textContent=f;
    sel.appendChild(o);
  }
  sel.value=cur==='all'||farms[cur]?'all':cur;
  if(farms[cur])sel.value=cur;

  var tbody=$('logBody');
  if(!filtered.length){
    tbody.innerHTML='<tr><td colspan="6" class="empty">Chưa có dữ liệu</td></tr>';
  }else{
    var html='';
    for(var j=0;j<filtered.length;j++){
      var l=filtered[j];
      var info=classifyPH(l.ph);
      var conf=l.confidence||0;
      var confColor=conf>=80?'#10b981':conf>=60?'#f59e0b':'#ef4444';
      html+='<tr>'+
        '<td>'+new Date(l.time).toLocaleString('vi-VN')+'</td>'+
        '<td>'+escapeHtml(l.farm)+'</td>'+
        '<td><b>'+l.ph.toFixed(1)+'</b></td>'+
        '<td><span style="color:'+confColor+';font-weight:700">'+conf+'%</span></td>'+
        '<td><span class="status-badge '+info.cls+'" style="padding:3px 10px;font-size:.72rem">'+l.status+'</span></td>'+
        '<td><span class="view" onclick="viewLog('+l.id+')">👁️</span> <span class="del" onclick="deleteLog('+l.id+')">✕</span></td>'+
        '</tr>';
    }
    tbody.innerHTML=html;
  }
  drawChart(filtered);
}

$('searchBox').addEventListener('input',renderLog);
$('filterVuon').addEventListener('change',renderLog);

function viewLog(id){
  var logs=getLogs();
  var log=null;
  for(var i=0;i<logs.length;i++)if(logs[i].id===id){log=logs[i];break;}
  if(!log){toast('Không tìm thấy');return;}
  var info=classifyPH(log.ph);
  var html='';
  if(log.image){
    html+='<img class="modal-img" src="'+log.image+'" alt="Ảnh mẫu">';
  }
  html+='<div class="modal-detail">';
  html+='<div><b>Thời gian:</b> '+new Date(log.time).toLocaleString('vi-VN')+'</div>';
  html+='<div><b>Vườn:</b> '+escapeHtml(log.farm)+'</div>';
  html+='<div><b>pH:</b> <span style="color:'+info.color+';font-size:1.2rem;font-weight:800">'+log.ph.toFixed(1)+'</span> ('+log.status+')</div>';
  if(log.confidence)html+='<div><b>Độ tin cậy:</b> '+log.confidence+'%</div>';
  if(log.deltaE)html+='<div><b>ΔE2000:</b> '+log.deltaE+' (càng nhỏ càng chính xác)</div>';
  if(log.refMatchPH)html+='<div><b>Màu tham chiếu gần nhất:</b> pH '+log.refMatchPH+'</div>';
  html+='<div><b>RGB gốc:</b> '+log.r+', '+log.g+', '+log.b+'</div>';
  if(log.rCorr)html+='<div><b>RGB hiệu chỉnh:</b> '+log.rCorr+', '+log.gCorr+', '+log.bCorr+'</div>';
  if(log.lab)html+='<div><b>CIELAB:</b> L:'+log.lab.L.toFixed(1)+' a:'+log.lab.a.toFixed(1)+' b:'+log.lab.b.toFixed(1)+'</div>';
  if(log.temp)html+='<div><b>Nhiệt độ đất:</b> '+log.temp+'°C</div>';
  if(log.humidity)html+='<div><b>Độ ẩm đất:</b> '+log.humidity+'%</div>';
  if(log.note)html+='<div><b>Ghi chú:</b> '+escapeHtml(log.note)+'</div>';
  html+='</div>';
  $('modalContent').innerHTML=html;

  $('editNoteBtn').onclick=function(){
    var newNote=prompt('Sửa ghi chú:', log.note||'');
    if(newNote===null)return;
    log.note=newNote;
    var all=getLogs();
    for(var k=0;k<all.length;k++)if(all[k].id===id){all[k].note=newNote;break;}
    localStorage.setItem('dsp_logs',JSON.stringify(all));
    toast('✅ Đã cập nhật');
    closeModal();
    renderLog();
  };
  $('deleteFromModalBtn').onclick=function(){
    closeModal();
    deleteLog(id);
  };
  $('modalBg').classList.add('show');
}

function closeModal(){
  $('modalBg').classList.remove('show');
}

function deleteLog(id){
  if(!confirm('Xóa bản ghi này?'))return;
  var logs=getLogs().filter(function(l){return l.id!==id;});
  localStorage.setItem('dsp_logs',JSON.stringify(logs));
  renderLog();renderHome();
  toast('🗑️ Đã xóa');
}

function clearLog(){
  if(!confirm('Xóa TOÀN BỘ nhật ký? Không thể hoàn tác!'))return;
  localStorage.removeItem('dsp_logs');
  renderLog();renderHome();
  toast('🗑️ Đã xóa tất cả');
}

/* ============================================================
   EXPORT
   ============================================================ */
function exportCSV(){
  var logs=getLogs();
  if(!logs.length){toast('Không có dữ liệu');return;}
  var rows=[['Thoi gian','Vuon','pH','Trang thai','Do tin cay','DeltaE','R goc','G goc','B goc','R chinh','G chinh','B chinh','Nhiet do','Do am','Ghi chu']];
  for(var i=0;i<logs.length;i++){
    var l=logs[i];
    rows.push([
      '"'+new Date(l.time).toLocaleString('vi-VN')+'"',
      '"'+l.farm+'"',
      l.ph.toFixed(1),
      l.status,
      (l.confidence||0)+'%',
      l.deltaE||'',
      l.r,l.g,l.b,
      l.rCorr||'',l.gCorr||'',l.bCorr||'',
      l.temp||'',l.humidity||'',
      '"'+(l.note||'').replace(/"/g,'""')+'"'
    ]);
  }
  var csv='\uFEFF'+rows.map(function(r){return r.join(',');}).join('\n');
  downloadBlob(csv,'duriansoil_log.csv','text/csv;charset=utf-8');
  toast('⬇️ Đã xuất CSV');
}

function exportJSON(){
  var logs=getLogs();
  if(!logs.length){toast('Không có dữ liệu');return;}
  var data={
    version:'1.0',
    exported:new Date().toISOString(),
    logs:logs,
    coefficients:state.coefficients,
    refColors:state.refColors
  };
  downloadBlob(JSON.stringify(data,null,2),'duriansoil_backup.json','application/json');
  toast('💾 Đã xuất backup');
}

function exportPDF(){
  var logs=getLogs();
  if(!logs.length){toast('Không có dữ liệu');return;}
  var filter=$('filterVuon').value;
  var filtered=filter==='all'?logs:logs.filter(function(l){return l.farm===filter;});
  var w=window.open('','_blank');
  var rowsHtml='';
  for(var i=0;i<filtered.length;i++){
    var l=filtered[i];
    var color=classifyPH(l.ph).color;
    rowsHtml+='<tr>'+
      '<td>'+(i+1)+'</td>'+
      '<td>'+new Date(l.time).toLocaleString('vi-VN')+'</td>'+
      '<td>'+escapeHtml(l.farm)+'</td>'+
      '<td style="color:'+color+';font-weight:700">'+l.ph.toFixed(1)+'</td>'+
      '<td>'+l.status+'</td>'+
      '<td>'+((l.confidence||0))+'%</td>'+
      '<td>'+escapeHtml(l.note||'')+'</td>'+
      '</tr>';
  }
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nhật ký pH</title>'+
    '<style>body{font-family:Arial;padding:24px;color:#111}h1{color:#047857;border-bottom:3px solid #10b981;padding-bottom:8px}.meta{color:#6b7280;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#10b981;color:#fff}tr:nth-child(even){background:#f9fafb}.footer{margin-top:20px;font-size:11px;color:#6b7280;text-align:center}</style></head><body>'+
    '<h1>🌱 Nhật ký đo pH đất sầu riêng</h1>'+
    '<div class="meta">'+
    '<div><b>Ứng dụng:</b> DurianSoil pH-Vision</div>'+
    '<div><b>Xuất ngày:</b> '+new Date().toLocaleString('vi-VN')+'</div>'+
    '<div><b>Vườn:</b> '+(filter==='all'?'Tất cả':escapeHtml(filter))+'</div>'+
    '<div><b>Tổng số mẫu:</b> '+filtered.length+'</div>'+
    '</div>'+
    '<table><thead><tr><th>#</th><th>Thời gian</th><th>Vườn</th><th>pH</th><th>Trạng thái</th><th>Tin cậy</th><th>Ghi chú</th></tr></thead><tbody>'+rowsHtml+'</tbody></table>'+
    '<div class="footer">Báo cáo tự động từ DurianSoil pH-Vision</div>'+
    '<script>window.onload=function(){setTimeout(function(){window.print();},400)}<\/script></body></html>';
  w.document.write(html);
  w.document.close();
  toast('📄 Đang mở hộp thoại in PDF...');
}

function downloadBlob(content,name,type){
  var blob=new Blob([content],{type:type});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}

/* ============================================================
   IMPORT JSON
   ============================================================ */
$('importJSON').addEventListener('change',function(e){
  var file=e.target.files[0];
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try{
      var data=JSON.parse(ev.target.result);
      if(!data.logs||!Array.isArray(data.logs))throw new Error('File không hợp lệ');
      if(!confirm('Phục hồi '+data.logs.length+' bản ghi? Dữ liệu hiện tại sẽ bị ghi đè.'))return;
      localStorage.setItem('dsp_logs',JSON.stringify(data.logs));
      if(data.coefficients)localStorage.setItem('dsp_coef',JSON.stringify(data.coefficients));
      if(data.refColors){
        state.refColors=data.refColors;
        localStorage.setItem('dsp_ref',JSON.stringify(data.refColors));
      }
      renderLog();renderHome();renderRefGrid();
      toast('✅ Đã phục hồi');
    }catch(err){
      toast('❌ Lỗi: '+err.message);
    }
  };
  reader.readAsText(file);
  e.target.value='';
});

/* ============================================================
   CHART
   ============================================================ */
var chart=null;
function drawChart(logs){
  if(typeof Chart==='undefined')return;
  var ctx=$('phChart').getContext('2d');
  if(chart)chart.destroy();
  var sorted=logs.slice().reverse();
  if(!sorted.length){
    chart=new Chart(ctx,{type:'line',data:{labels:['Chưa có'],datasets:[{label:'pH',data:[],borderColor:'#10b981'}]},options:{responsive:true,maintainAspectRatio:false}});
    return;
  }
  var labels=[],data=[],colors=[];
  for(var i=0;i<sorted.length;i++){
    labels.push(new Date(sorted[i].time).toLocaleDateString('vi-VN'));
    data.push(sorted[i].ph);
    colors.push(classifyPH(sorted[i].ph).color);
  }
  chart=new Chart(ctx,{
    type:'line',
    data:{
      labels:labels,
      datasets:[{
        label:'pH đất',data:data,
        borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.12)',
        tension:0.3,fill:true,pointRadius:5,
        pointBackgroundColor:colors,
        pointBorderColor:'#fff',pointBorderWidth:2
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      scales:{y:{min:3.5,max:8,ticks:{stepSize:1}}},
      plugins:{legend:{display:false}}
    }
  });
}

/* ============================================================
   ADMIN
   ============================================================ */
function renderRefGrid(){
  var html='';
  for(var i=0;i<state.refColors.length;i++){
    var c=state.refColors[i];
    var lum=c.r*0.299+c.g*0.587+c.b*0.114;
    html+='<div class="ref-item" data-idx="'+i+'" style="background:rgb('+c.r+','+c.g+','+c.b+');color:'+(lum>128?'#111':'#fff')+'" onclick="editRef('+i+')">pH '+c.ph+'</div>';
  }
  $('refGrid').innerHTML=html;
}

function editRef(idx){
  var c=state.refColors[idx];
  var r=prompt('Màu chuẩn pH '+c.ph+'\nNhập R (0-255):',c.r);
  if(r===null)return;
  var g=prompt('Nhập G (0-255):',c.g);
  if(g===null)return;
  var b=prompt('Nhập B (0-255):',c.b);
  if(b===null)return;
  c.r=Math.max(0,Math.min(255,parseInt(r)||c.r));
  c.g=Math.max(0,Math.min(255,parseInt(g)||c.g));
  c.b=Math.max(0,Math.min(255,parseInt(b)||c.b));
  localStorage.setItem('dsp_ref',JSON.stringify(state.refColors));
  renderRefGrid();
  toast('✅ Đã cập nhật màu pH '+c.ph);
}

function loadCoef(){
  try{
    var saved=JSON.parse(localStorage.getItem('dsp_coef'));
    if(saved&&typeof saved.a==='number')state.coefficients=saved;
    var savedRef=JSON.parse(localStorage.getItem('dsp_ref'));
    if(savedRef&&Array.isArray(savedRef)&&savedRef.length)state.refColors=savedRef;
  }catch(e){}
  $('coefA').value=state.coefficients.a;
  $('coefB').value=state.coefficients.b;
  $('coefC').value=state.coefficients.c;
  $('coefD').value=state.coefficients.d;
  $('coefE').value=state.coefficients.e;
}
function saveCoef(){
  state.coefficients={
    a:parseFloat($('coefA').value)||0,
    b:parseFloat($('coefB').value)||0,
    c:parseFloat($('coefC').value)||0,
    d:parseFloat($('coefD').value)||0,
    e:parseFloat($('coefE').value)||0
  };
  localStorage.setItem('dsp_coef',JSON.stringify(state.coefficients));
  toast('💾 Đã lưu hệ số');
}
function resetCoef(){
  state.coefficients={a:0.012,b:-0.015,c:0.008,d:0.025,e:3.5};
  localStorage.removeItem('dsp_coef');
  loadCoef();
  toast('↺ Đã khôi phục mặc định');
}

/* ============================================================
   SAMPLES
   ============================================================ */
function getSamples(){
  try{return JSON.parse(localStorage.getItem('dsp_samples'))||[];}
  catch(e){return[];}
}
function renderSamples(){
  var samples=getSamples();
  var tbody=$('sampleBody');
  if(!samples.length){
    tbody.innerHTML='<tr><td colspan="5" class="empty">Chưa có mẫu</td></tr>';
    $('rmseValue').textContent='—';
    return;
  }
  var sumSq=0,html='';
  for(var i=0;i<samples.length;i++){
    var s=samples[i];
    var d=s.app-s.std;
    sumSq+=d*d;
    html+='<tr><td>'+(i+1)+'</td><td>'+s.app.toFixed(2)+'</td><td>'+s.std.toFixed(2)+'</td>'+
      '<td style="color:'+(Math.abs(d)<0.3?'#10b981':'#ef4444')+'">'+d.toFixed(2)+'</td>'+
      '<td class="del" onclick="delSample('+i+')">✕</td></tr>';
  }
  tbody.innerHTML=html;
  var rmse=Math.sqrt(sumSq/samples.length);
  $('rmseValue').textContent=rmse.toFixed(3)+' pH';
}
function addSample(){
  var a=prompt('Nhập pH đo bằng App:');
  if(a===null)return;
  var app=parseFloat(a);
  if(isNaN(app)){toast('Số không hợp lệ');return;}
  var b=prompt('Nhập pH đo bằng máy chuẩn:');
  if(b===null)return;
  var std=parseFloat(b);
  if(isNaN(std)){toast('Số không hợp lệ');return;}
  var s=getSamples();
  s.push({app:app,std:std});
  localStorage.setItem('dsp_samples',JSON.stringify(s));
  renderSamples();
  toast('✅ Đã thêm mẫu');
}
function delSample(i){
  var s=getSamples();
  s.splice(i,1);
  localStorage.setItem('dsp_samples',JSON.stringify(s));
  renderSamples();
}

/* ============================================================
   ONLINE/OFFLINE
   ============================================================ */
function updateStatus(){
  var el=$('onlineStatus');
  var online=navigator.onLine;
  el.textContent=online?'● Online':'● Offline';
  el.style.background=online?'rgba(255,255,255,.2)':'rgba(239,68,68,.5)';
}
window.addEventListener('online',updateStatus);
window.addEventListener('offline',updateStatus);

/* ============================================================
   QR CAMERA REMOTE
   ============================================================ */
var qrState = {
  token: null,
  expiresAt: 0,
  timer: null,
  bc: null,
  mode: 'host'
};

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

function initChannel(onMessage){
  if ('BroadcastChannel' in window) {
    try {
      qrState.bc = new BroadcastChannel('duriansoil_cam');
      qrState.bc.onmessage = function(ev){ onMessage(ev.data); };
    } catch(e){ qrState.bc = null; }
  }
  window.addEventListener('storage', function(ev){
    if (ev.key === 'dsp_cam_msg' && ev.newValue) {
      try { onMessage(JSON.parse(ev.newValue)); } catch(e){}
    }
  });
}

function sendChannel(msg){
  msg._t = Date.now();
  var payload = JSON.stringify(msg);
  if (qrState.bc) {
    try { qrState.bc.postMessage(msg); } catch(e){}
  }
  try {
    localStorage.setItem('dsp_cam_msg', payload);
    setTimeout(function(){
      try { localStorage.removeItem('dsp_cam_msg'); } catch(e){}
    }, 1500);
  } catch(e){}
}

function fmtTime(ms){
  if (ms < 0) ms = 0;
  var s = Math.floor(ms/1000);
  var m = Math.floor(s/60);
  s = s % 60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}

function openQRPanel(){
  if (isFileProtocol()) {
    toast('⚠️ Đang mở file:// — QR chỉ mở được trên máy này. Hãy host qua http(s) để dùng trên điện thoại.');
  }
  $('qrPanel').style.display = 'block';
  createQRToken();
  initChannel(function(msg){
    if (!msg || msg.type !== 'photo') return;
    if (msg.token !== qrState.token) return;
    if (Date.now() > qrState.expiresAt) {
      $('qrStatus').textContent = '❌ Mã đã hết hạn, ảnh không được nhận.';
      return;
    }
    $('qrStatus').textContent = '✅ Đã nhận ảnh từ điện thoại! Đang xử lý...';
    stopQRTimer();
    $('qrPanel').style.display = 'none';
    loadImageFromDataUrl(msg.dataUrl);
    toast('📥 Đã nhận ảnh từ điện thoại');
  });
  window.addEventListener('storage', function(ev){
    if (ev.key === 'dsp_cam_msg' && ev.newValue) {
      try {
        var m = JSON.parse(ev.newValue);
        if (m.type === 'hello' && m.token === qrState.token && Date.now() <= qrState.expiresAt) {
          $('qrStatus').textContent = '📱 Điện thoại đã kết nối. Đang chờ ảnh...';
        }
      } catch(e){}
    }
  });
}

function createQRToken(){
  qrState.token = makeToken(24);
  qrState.expiresAt = Date.now() + 3*60*1000;
  var url = getBaseUrl() + '?cam=' + encodeURIComponent(qrState.token);

  var box = $('qrBox');
  box.innerHTML = '';
  try {
    new QRCode(box, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#047857',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e) {
    box.innerHTML = '<div style="color:#ef4444;font-size:.85rem">Không tạo được QR.<br>'+url+'</div>';
  }

  stopQRTimer();
  qrState.timer = setInterval(function(){
    var left = qrState.expiresAt - Date.now();
    if (left <= 0) {
      $('qrCountdown').textContent = '00:00';
      $('qrStatus').textContent = '❌ Mã đã hết hạn. Bấm "Tạo mã mới" để tiếp tục.';
      stopQRTimer();
      return;
    }
    $('qrCountdown').textContent = fmtTime(left);
  }, 500);

  $('qrStatus').textContent = 'Đang chờ điện thoại kết nối...';
}

function stopQRTimer(){
  if (qrState.timer) { clearInterval(qrState.timer); qrState.timer = null; }
}

function runPhoneMode(token){
  qrState.mode = 'phone';
  qrState.token = token;
  document.body.innerHTML = '' +
    '<div style="max-width:520px;margin:0 auto;padding:16px;font-family:Arial">' +
      '<div style="background:#10b981;color:#fff;padding:12px;border-radius:10px;text-align:center;font-weight:700">' +
        '📱 Camera điện thoại — DurianSoil' +
      '</div>' +
      '<div id="phonePermBox" style="margin:12px 0;padding:12px;background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.06)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<div>' +
            '<b style="font-size:.9rem">🎥 Quyền Camera</b>' +
            '<div id="phonePermStatus" style="font-size:.82rem;color:#6b7280;margin-top:4px">Đang kiểm tra...</div>' +
          '</div>' +
          '<button id="phoneReqBtn" style="padding:9px 14px;border:none;border-radius:8px;background:#10b981;color:#fff;font-weight:700;font-size:.85rem;cursor:pointer">🔐 Cấp quyền</button>' +
        '</div>' +
      '</div>' +
      '<div id="phoneMsg" style="margin:12px 0;padding:10px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;font-size:.85rem">' +
        'Bấm "Cấp quyền" để bắt đầu.' +
      '</div>' +
      '<div style="position:relative;width:100%;padding-bottom:75%;background:#111;border-radius:12px;overflow:hidden">' +
        '<video id="pVideo" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>' +
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
          '<div style="width:72%;height:26%;border:3px dashed #fff;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.4)"></div>' +
        '</div>' +
      '</div>' +
      '<button id="pShot" style="display:block;width:100%;margin:12px 0;padding:15px;border:none;border-radius:10px;background:#10b981;color:#fff;font-size:1rem;font-weight:700;cursor:pointer">📸 Chụp & gửi về máy tính</button>' +
      '<button id="pSwitch" style="display:block;width:100%;margin:8px 0;padding:11px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:.9rem;cursor:pointer">🔄 Đổi camera trước/sau</button>' +
      '<canvas id="pCanvas" style="display:none"></canvas>' +
      '<div style="font-size:.8rem;color:#6b7280;margin-top:12px">Sau khi chụp, ảnh sẽ tự động gửi về tab đang mở QR trên máy tính.</div>' +
    '</div>';

  var facing = 'environment';
  var stream = null;

  function setMsg(t, color){
    var el = document.getElementById('phoneMsg');
    el.textContent = t;
    el.style.background = color === 'err' ? '#fef2f2' : color === 'ok' ? '#ecfdf5' : '#fffbeb';
    el.style.borderLeftColor = color === 'err' ? '#ef4444' : color === 'ok' ? '#10b981' : '#f59e0b';
  }

  function setPermStatus(text, color){
    var el = document.getElementById('phonePermStatus');
    el.innerHTML = text;
    el.style.color = color || '#6b7280';
  }

  function startCam(){
    if (stream) { stream.getTracks().forEach(function(t){t.stop();}); stream = null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg('Trình duyệt không hỗ trợ camera.', 'err');
      setPermStatus('⚪ Không hỗ trợ', '#6b7280');
      return;
    }
    setMsg('⏳ Đang xin quyền camera...');
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
        sendChannel({ type:'hello', token: token });
      })
      .catch(function(err){
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermStatus('🔴 Đã bị chặn', '#ef4444');
          setMsg('❌ Bạn đã từ chối quyền camera. Mở Cài đặt trình duyệt → Quyền trang web → Camera → Cho phép → tải lại trang.', 'err');
        } else if (err.name === 'NotFoundError') {
          setPermStatus('⚠️ Không có camera', '#f59e0b');
          setMsg('❌ Không tìm thấy camera trên thiết bị.', 'err');
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
    var c = document.getElementById('pCanvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    var dataUrl = c.toDataURL('image/jpeg', 0.9);
    setMsg('📤 Đang gửi ảnh về máy tính...');
    sendChannel({ type:'photo', token: token, dataUrl: dataUrl });
    setTimeout(function(){
      setMsg('✅ Đã gửi ảnh. Có thể chụp lại nếu muốn, hoặc đóng tab.', 'ok');
    }, 400);
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
        setMsg('❌ Camera đã bị chặn. Vào cài đặt trình duyệt để mở lại.', 'err');
      } else {
        setPermStatus('🟡 Chưa cấp quyền', '#f59e0b');
      }
    }).catch(function(){
      setPermStatus('🟡 Chưa cấp quyền', '#f59e0b');
    });
  } else {
    setPermStatus('🟡 Bấm để cấp quyền', '#f59e0b');
  }
}

$('qrConnectBtn').addEventListener('click', openQRPanel);
$('qrRenewBtn').addEventListener('click', function(){
  createQRToken();
  toast('🔄 Đã tạo mã QR mới');
});
$('qrCloseBtn').addEventListener('click', function(){
  stopQRTimer();
  $('qrPanel').style.display = 'none';
});

(function checkPhoneMode(){
  var m = location.search.match(/[?&]cam=([^&]+)/);
  if (m && m[1]) {
    var token = decodeURIComponent(m[1]);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function(){ runPhoneMode(token); });
    } else {
      runPhoneMode(token);
    }
  }
})();

/* ============================================================
   INIT
   ============================================================ */
renderHome();
loadCoef();
renderRefGrid();
renderSamples();
updateStatus();
initCameraPermission();
setTimeout(function(){drawChart(getLogs());},500);