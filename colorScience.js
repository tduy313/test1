/* ============================================================
   colorScience.js
   Thư viện thuần túy: chuyển đổi màu + ước lượng pH
   KHÔNG đụng DOM — có thể dùng cho Node.js, Web Worker, test...
   
   API:
     CS.rgb2hsv(r,g,b)              → {h,s,v}
     CS.rgb2lab(r,g,b)              → {L,a,b}
     CS.deltaE2000(lab1, lab2)      → number
     CS.autoWhiteBalance(imgData)   → {scaleR, scaleG, scaleB}
     CS.sampleColors(imgData,x,y,n) → {r,g,b,count}
     CS.estimatePH(correctedRGB, opts) → {ph, confidence, lab, bestDE, refMatch, deltas}
     CS.classifyPH(ph)              → {status, cls, color}
   ============================================================ */

(function(global){
  'use strict';

  /* ---------- HẰNG SỐ MẶC ĐỊNH ---------- */
  const DEFAULT_REF_COLORS = [
    {ph:4.0, r:220, g:50,  b:60 },
    {ph:4.5, r:230, g:100, b:70 },
    {ph:5.0, r:240, g:160, b:80 },
    {ph:5.5, r:250, g:210, b:90 },
    {ph:6.0, r:170, g:220, b:100},
    {ph:6.5, r:110, g:200, b:120},
    {ph:7.0, r:70,  g:180, b:180},
    {ph:7.5, r:60,  g:130, b:200}
  ];

  const DEFAULT_COEFFICIENTS = {a:0.012, b:-0.015, c:0.008, d:0.025, e:3.5};

  /* ============================================================
     CHUYỂN ĐỔI KHÔNG GIAN MÀU
     ============================================================ */

  /**
   * RGB → HSV
   * @returns {{h:number, s:number, v:number}} h:0-360, s:0-100, v:0-100
   */
  function rgb2hsv(r, g, b){
    r/=255; g/=255; b/=255;
    const max = Math.max(r,g,b);
    const min = Math.min(r,g,b);
    const d   = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d/max;
    const v = max;

    if(d !== 0){
      if(max === r)      h = (g-b)/d + (g < b ? 6 : 0);
      else if(max === g) h = (b-r)/d + 2;
      else               h = (r-g)/d + 4;
      h *= 60;
    }
    return {h:Math.round(h), s:Math.round(s*100), v:Math.round(v*100)};
  }

  /**
   * RGB → XYZ (D65, sRGB)
   */
  function rgb2xyz(r, g, b){
    const inv = c => {
      c = c/255;
      return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    };
    const R = inv(r)*100, G = inv(g)*100, B = inv(b)*100;
    return {
      x: R*0.4124564 + G*0.3575761 + B*0.1804375,
      y: R*0.2126729 + G*0.7151522 + B*0.0721750,
      z: R*0.0193339 + G*0.1191920 + B*0.9503041
    };
  }

  /**
   * XYZ → CIELAB (D65)
   */
  function xyz2lab(x, y, z){
    const Xn = 95.047, Yn = 100.000, Zn = 108.883;
    const f = t => t > 0.008856 ? Math.pow(t, 1/3) : (7.787*t + 16/116);
    const fx = f(x/Xn), fy = f(y/Yn), fz = f(z/Zn);
    return {
      L: 116*fy - 16,
      a: 500*(fx - fy),
      b: 200*(fy - fz)
    };
  }

  /**
   * RGB → CIELAB (shortcut)
   */
  function rgb2lab(r, g, b){
    const xyz = rgb2xyz(r, g, b);
    return xyz2lab(xyz.x, xyz.y, xyz.z);
  }

  /* ============================================================
     SO SÁNH MÀU — ΔE2000 (CIE 2000)
     ============================================================ */

  /**
   * Khoảng cách màu ΔE2000 giữa 2 Lab
   * Chuẩn quốc tế CIE — ΔE < 1 mắt người khó phân biệt
   */
  function deltaE2000(lab1, lab2){
    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;
    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1*a1 + b1*b1);
    const C2 = Math.sqrt(a2*a2 + b2*b2);
    const Cbar = (C1 + C2) / 2;
    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.sqrt(a1p*a1p + b1*b1);
    const C2p = Math.sqrt(a2p*a2p + b2*b2);

    let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
    if(h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
    if(h2p < 0) h2p += 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = 0;
    if(C1p * C2p !== 0){
      dhp = h2p - h1p;
      if(dhp > 180) dhp -= 360;
      else if(dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;

    let hbarp = 0;
    if(C1p * C2p !== 0){
      hbarp = (h1p + h2p) / 2;
      if(Math.abs(h1p - h2p) > 180){
        hbarp = (h1p + h2p < 360)
          ? (h1p + h2p + 360) / 2
          : (h1p + h2p - 360) / 2;
      }
    }

    const T = 1
      - 0.17 * Math.cos((hbarp - 30) * Math.PI / 180)
      + 0.24 * Math.cos(2 * hbarp * Math.PI / 180)
      + 0.32 * Math.cos((3 * hbarp + 6) * Math.PI / 180)
      - 0.20 * Math.cos((4 * hbarp - 63) * Math.PI / 180);

    const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2))
                 / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;

    const Cbarp7 = Math.pow(Cbarp, 7);
    const RT = -2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)))
             * Math.sin(60 * Math.exp(-Math.pow((hbarp - 275) / 25, 2)) * Math.PI / 180);

    return Math.sqrt(
      Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
  }

  /* ============================================================
     XỬ LÝ ẢNH
     ============================================================ */

  /**
   * Cân bằng trắng tự động — Gray World
   * Giả định trung bình màu của ảnh là xám trung tính
   */
  function autoWhiteBalance(imgData){
    const data = imgData.data;
    let sumR = 0, sumG = 0, sumB = 0, n = 0;

    for(let i = 0; i < data.length; i += 4){
      sumR += data[i];
      sumG += data[i+1];
      sumB += data[i+2];
      n++;
    }

    const avgR = sumR / n;
    const avgG = sumG / n;
    const avgB = sumB / n;
    const gray = (avgR + avgG + avgB) / 3;

    const clamp = v => Math.max(0.7, Math.min(1.4, v));

    return {
      scaleR: clamp(gray / avgR),
      scaleG: clamp(gray / avgG),
      scaleB: clamp(gray / avgB)
    };
  }

  /**
   * Lấy mẫu màu kích thước size×size quanh (cx, cy)
   * Lọc nhiễu bằng IQR (Interquartile Range)
   */
  function sampleColors(imgData, cx, cy, size){
    size = size || 5;
    const data = imgData.data;
    const w = imgData.width;
    const half = Math.floor(size / 2);
    const samples = [];

    for(let y = cy - half; y <= cy + half; y++){
      for(let x = cx - half; x <= cx + half; x++){
        if(x < 0 || y < 0 || x >= imgData.width || y >= imgData.height) continue;
        const idx = (y * w + x) * 4;
        samples.push({r:data[idx], g:data[idx+1], b:data[idx+2]});
      }
    }

    if(!samples.length) return {r:0, g:0, b:0, count:0};

    const rs = samples.map(s => s.r).sort((a,b) => a-b);
    const gs = samples.map(s => s.g).sort((a,b) => a-b);
    const bs = samples.map(s => s.b).sort((a,b) => a-b);

    const iqrRange = arr => {
      const q1 = arr[Math.floor(arr.length * 0.25)];
      const q3 = arr[Math.floor(arr.length * 0.75)];
      const iqr = q3 - q1;
      return {lo: q1 - 1.5*iqr, hi: q3 + 1.5*iqr};
    };

    const rr = iqrRange(rs);
    const gr = iqrRange(gs);
    const br = iqrRange(bs);

    let sumR = 0, sumG = 0, sumB = 0, cnt = 0;
    for(let i = 0; i < samples.length; i++){
      const s = samples[i];
      if(s.r >= rr.lo && s.r <= rr.hi &&
         s.g >= gr.lo && s.g <= gr.hi &&
         s.b >= br.lo && s.b <= br.hi){
        sumR += s.r;
        sumG += s.g;
        sumB += s.b;
        cnt++;
      }
    }

    if(cnt === 0) return {r:0, g:0, b:0, count:0};
    return {
      r: Math.round(sumR / cnt),
      g: Math.round(sumG / cnt),
      b: Math.round(sumB / cnt),
      count: cnt
    };
  }

  /* ============================================================
     ƯỚC LƯỢNG pH
     ============================================================ */

  /**
   * Ước lượng pH từ màu RGB đã hiệu chỉnh
   * @param {object} correctedRGB - {r, g, b}
   * @param {object} [options]    - {refColors, coefficients}
   * @returns {object} {ph, confidence, lab, bestDE, refMatch, deltas}
   */
  function estimatePH(correctedRGB, options){
    options = options || {};
    const refColors    = options.refColors    || DEFAULT_REF_COLORS;
    const coefficients = options.coefficients || DEFAULT_COEFFICIENTS;

    // 1. RGB → Lab
    const lab = rgb2lab(correctedRGB.r, correctedRGB.g, correctedRGB.b);

    // 2. Tính ΔE tới từng màu chuẩn
    const deltas = [];
    for(let i = 0; i < refColors.length; i++){
      const c = refColors[i];
      const labRef = rgb2lab(c.r, c.g, c.b);
      const dE = deltaE2000(lab, labRef);
      deltas.push({ph: c.ph, dE: dE, ref: c});
    }
    deltas.sort((a,b) => a.dE - b.dE);

    // 3. Nội suy trọng số từ 3 màu gần nhất
    const top = deltas.slice(0, 3);
    let sumW = 0, sumPH = 0;
    for(let j = 0; j < top.length; j++){
      const w = 1 / Math.pow(top[j].dE + 0.01, 2);
      sumW += w;
      sumPH += w * top[j].ph;
    }
    let ph = sumPH / sumW;

    // 4. Kết hợp hồi quy tuyến tính (RGB + Hue)
    const hsv = rgb2hsv(correctedRGB.r, correctedRGB.g, correctedRGB.b);
    const phReg = coefficients.a * correctedRGB.r
                + coefficients.b * correctedRGB.g
                + coefficients.c * correctedRGB.b
                + coefficients.d * hsv.h
                + coefficients.e;
    ph = 0.8 * ph + 0.2 * phReg;

    // 5. Clamp vào ngưỡng hợp lệ của giấy quỳ
    ph = Math.max(4.0, Math.min(7.5, ph));

    // 6. Tính độ tin cậy
    const bestDE   = top[0].dE;
    const secondDE = top[1].dE;
    const gap      = secondDE - bestDE;
    const confColor = Math.max(0, Math.min(1, 1 - bestDE / 30));
    const confSep   = Math.max(0, Math.min(1, gap / 15));
    let confidence  = 0.65 * confColor + 0.35 * confSep;

    const brightness = (correctedRGB.r + correctedRGB.g + correctedRGB.b) / 3;
    if(brightness < 60 || brightness > 240) confidence *= 0.7;

    return {
      ph: Math.round(ph * 10) / 10,
      confidence: Math.round(confidence * 100),
      lab: lab,
      bestDE: Math.round(bestDE * 10) / 10,
      refMatch: top[0],
      deltas: top
    };
  }

  /* ============================================================
     PHÂN LOẠI pH
     ============================================================ */

  /**
   * Phân loại pH đất (thô — 3 nhóm chính)
   * Dùng cho badge status trên UI
   */
  function classifyPH(ph){
    if(ph < 5.5)  return {status:'Chua',    cls:'status-chua',  color:'#ef4444'};
    if(ph <= 6.5) return {status:'Tối ưu',  cls:'status-toiuu', color:'#10b981'};
    return         {status:'Kiềm',    cls:'status-kiem',  color:'#3b82f6'};
  }

  /**
   * Phân loại pH chi tiết (5 nhóm)
   * Dùng cho khuyến nghị cải tạo đất
   */
  function classifyPHDetailed(ph){
    if(ph < 5.0)  return 'very-acid';
    if(ph < 5.5)  return 'acid';
    if(ph <= 6.5) return 'optimal';
    if(ph <= 7.2) return 'slightly-alkaline';
    return 'alkaline';
  }

  /* ============================================================
     XUẤT MODULE (UMD — chạy được cả browser & Node.js)
     ============================================================ */

  const ColorScience = {
    // Chuyển đổi màu
    rgb2hsv,
    rgb2xyz,
    xyz2lab,
    rgb2lab,
    // So sánh màu
    deltaE2000,
    // Xử lý ảnh
    autoWhiteBalance,
    sampleColors,
    // Phân tích pH
    estimatePH,
    classifyPH,
    classifyPHDetailed,
    // Hằng số
    DEFAULT_REF_COLORS,
    DEFAULT_COEFFICIENTS
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ColorScience;
  } else {
    global.ColorScience = ColorScience;
  }

})(typeof window !== 'undefined' ? window : globalThis);