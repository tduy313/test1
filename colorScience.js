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
    // ⭐ MỚI — xử lý ảnh nâng cao
    toGrayscale,
    sobelEdge,
    otsuThreshold,
    detectQuiStrip,
    computeHistogram,
    analyzeImageQuality,
    drawHistogram,
    // Phân tích pH
    estimatePH,
    classifyPH,
    classifyPHDetailed,
    // Hằng số
    DEFAULT_REF_COLORS,
    DEFAULT_COEFFICIENTS
  };
  
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

  /* ============================================================
     XỬ LÝ ẢNH NÂNG CAO — MỚI
     ============================================================ */

  /**
   * Chuyển RGB → Grayscale (luminance)
   * Dùng hệ số ITU-R BT.601
   */
  function toGrayscale(imgData){
    const data = imgData.data;
    const w = imgData.width, h = imgData.height;
    const gray = new Uint8ClampedArray(w * h);
    for(let i = 0, j = 0; i < data.length; i += 4, j++){
      gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
    }
    return { data: gray, width: w, height: h };
  }

  /**
   * Phát hiện biên Sobel
   * @returns {Uint8ClampedArray} magnitude 0-255
   */
  function sobelEdge(gray){
    const { data: g, width: w, height: h } = gray;
    const mag = new Uint8ClampedArray(w * h);
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for(let y = 1; y < h - 1; y++){
      for(let x = 1; x < w - 1; x++){
        let sx = 0, sy = 0;
        let k = 0;
        for(let dy = -1; dy <= 1; dy++){
          for(let dx = -1; dx <= 1; dx++){
            const v = g[(y + dy) * w + (x + dx)];
            sx += v * gx[k];
            sy += v * gy[k];
            k++;
          }
        }
        const m = Math.sqrt(sx * sx + sy * sy);
        mag[y * w + x] = m > 255 ? 255 : m;
      }
    }
    return { data: mag, width: w, height: h };
  }

  /**
   * Otsu threshold — ngưỡng nhị phân tự động tối ưu
   * @returns {number} ngưỡng 0-255
   */
  function otsuThreshold(gray){
    const { data: g } = gray;
    const hist = new Array(256).fill(0);
    for(let i = 0; i < g.length; i++) hist[g[i]]++;

    const total = g.length;
    let sum = 0;
    for(let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, maxVar = 0, threshold = 0;
    for(let t = 0; t < 256; t++){
      wB += hist[t];
      if(wB === 0) continue;
      const wF = total - wB;
      if(wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if(between > maxVar){
        maxVar = between;
        threshold = t;
      }
    }
    return threshold;
  }

  /**
   * Phát hiện dải giấy quỳ tự động trong ảnh
   * Chiến lược:
   *   1. Grayscale + blur nhẹ
   *   2. Sobel edge
   *   3. Otsu threshold → nhị phân
   *   4. Connected-component để tìm vùng lớn nhất
   *   5. Lọc theo tỉ lệ khung + độ bão hòa màu
   *
   * @param {ImageData} imgData
   * @param {object} [opts] { minArea, maxArea, minAspect, maxAspect, maxCount }
   * @returns {Array<{x,y,w,h,confidence,avgRGB}>}
   */
  function detectQuiStrip(imgData, opts){
    opts = opts || {};
    const minArea  = opts.minArea  || 0.02; // 2% diện tích ảnh
    const maxArea  = opts.maxArea  || 0.85;
    const maxCount = opts.maxCount || 5;
    const W = imgData.width, H = imgData.height;
    const totalPx = W * H;

    // 1. Grayscale
    const gray = toGrayscale(imgData);
    // 2. Sobel
    const edge = sobelEdge(gray);
    // 3. Otsu
    const th = otsuThreshold(gray);
    // 4. Nhị phân: biên mạnh = 1
    const bin = new Uint8Array(W * H);
    const edgeTh = Math.max(30, th * 0.4);
    for(let i = 0; i < edge.data.length; i++){
      bin[i] = edge.data[i] > edgeTh ? 1 : 0;
    }

    // 5. Connected components (4-neighbor BFS)
    const labels = new Int32Array(W * H).fill(-1);
    const components = [];
    const queue = new Int32Array(W * H);
    let label = 0;

    for(let i = 0; i < bin.length; i++){
      if(bin[i] !== 1 || labels[i] !== -1) continue;
      let head = 0, tail = 0;
      queue[tail++] = i;
      labels[i] = label;
      let minX = i % W, maxX = i % W, minY = (i / W) | 0, maxY = (i / W) | 0;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;

      while(head < tail){
        const p = queue[head++];
        const px = p % W, py = (p / W) | 0;
        if(px < minX) minX = px;
        if(px > maxX) maxX = px;
        if(py < minY) minY = py;
        if(py > maxY) maxY = py;
        const idx4 = p * 4;
        sumR += imgData.data[idx4];
        sumG += imgData.data[idx4+1];
        sumB += imgData.data[idx4+2];
        count++;

        // 4 hướng
        const neighbors = [p - 1, p + 1, p - W, p + W];
        for(let n = 0; n < 4; n++){
          const q = neighbors[n];
          if(q < 0 || q >= bin.length) continue;
          // Kiểm tra tràn hàng
          if((n === 0 && px === 0) || (n === 1 && px === W - 1)) continue;
          if(bin[q] === 1 && labels[q] === -1){
            labels[q] = label;
            queue[tail++] = q;
          }
        }
      }

      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const area = cw * ch;
      const areaRatio = area / totalPx;
      const aspect = cw / ch;
      const fill = count / area; // độ đặc

      // Lọc: diện tích, tỉ lệ, độ đặc
      if(areaRatio >= minArea && areaRatio <= maxArea &&
         fill > 0.25 &&
         aspect > 0.15 && aspect < 8){
        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);
        const sat = (Math.max(avgR,avgG,avgB) - Math.min(avgR,avgG,avgB)) /
                    (Math.max(avgR,avgG,avgB) || 1);

        // Confidence: tỉ lệ giữa fill + saturation + kích thước
        const conf = Math.min(1,
          0.5 * fill +
          0.3 * sat +
          0.2 * Math.min(1, areaRatio / 0.3)
        );

        components.push({
          x: minX, y: minY, w: cw, h: ch,
          area, fill, aspect,
          avgRGB: { r: avgR, g: avgG, b: avgB },
          confidence: Math.round(conf * 100)
        });
      }
      label++;
    }

    // 6. Sắp xếp theo confidence × diện tích, lấy top
    components.sort(function(a, b){
      return (b.confidence * b.area) - (a.confidence * a.area);
    });

    return components.slice(0, maxCount);
  }

  /**
   * Tính histogram RGB (256 bins)
   */
  function computeHistogram(imgData){
    const r = new Array(256).fill(0);
    const g = new Array(256).fill(0);
    const b = new Array(256).fill(0);
    const data = imgData.data;
    for(let i = 0; i < data.length; i += 4){
      r[data[i]]++;
      g[data[i+1]]++;
      b[data[i+2]]++;
    }
    return { r, g, b };
  }

  /**
   * Phân tích chất lượng ảnh — cảnh báo cho người dùng
   * @returns {{score, issues:string[], advice:string}}
   */
  function analyzeImageQuality(imgData){
    const hist = computeHistogram(imgData);
    const total = imgData.width * imgData.height;
    const issues = [];
    let score = 100;

    // 1. Kiểm tra over/under exposure
    const darkRatio  = (hist.r[0]   + hist.g[0]   + hist.b[0])   / (total * 3);
    const brightRatio= (hist.r[255] + hist.g[255] + hist.b[255]) / (total * 3);

    if(darkRatio > 0.35){
      issues.push('Ảnh quá tối — bật đèn LED sáng hơn');
      score -= 25;
    }
    if(brightRatio > 0.25){
      issues.push('Ảnh cháy sáng — giảm đèn hoặc tránh nắng trực tiếp');
      score -= 25;
    }

    // 2. Độ tương phản (dải động)
    let minV = 255, maxV = 0;
    for(let i = 0; i < 256; i++){
      if(hist.r[i] + hist.g[i] + hist.b[i] > total * 0.001){
        if(i < minV) minV = i;
        if(i > maxV) maxV = i;
      }
    }
    const range = maxV - minV;
    if(range < 100){
      issues.push('Ảnh thiếu tương phản — có thể bị mờ hoặc thiếu sáng');
      score -= 15;
    }

    // 3. Độ bão hòa màu (đất xám, giấy quỳ có màu)
    const data = imgData.data;
    let satSum = 0, n = 0;
    for(let i = 0; i < data.length; i += 16){
      const r = data[i], g = data[i+1], b = data[i+2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      satSum += (mx === 0) ? 0 : (mx - mn) / mx;
      n++;
    }
    const avgSat = satSum / n;
    if(avgSat < 0.08){
      issues.push('Ảnh gần như xám — có thể không có giấy quỳ trong khung');
      score -= 30;
    } else if(avgSat < 0.15){
      issues.push('Màu nhạt — giấy quỳ có thể bị phai hoặc ảnh thiếu sáng');
      score -= 10;
    }

    // 4. Độ sắc nét (Laplacian variance đơn giản)
    const gray = toGrayscale(imgData);
    let lapVar = 0, lapN = 0;
    const gd = gray.data, W = gray.width, H = gray.height;
    for(let y = 1; y < H - 1; y += 2){
      for(let x = 1; x < W - 1; x += 2){
        const lap = -4 * gd[y*W + x]
          + gd[(y-1)*W + x] + gd[(y+1)*W + x]
          + gd[y*W + (x-1)] + gd[y*W + (x+1)];
        lapVar += lap * lap;
        lapN++;
      }
    }
    lapVar /= (lapN || 1);
    if(lapVar < 80){
      issues.push('Ảnh bị mờ — giữ máy chắc, lấy nét lại');
      score -= 20;
    }

    // 5. Kết luận
    score = Math.max(0, Math.min(100, score));
    let advice;
    if(score >= 80) advice = '✅ Chất lượng ảnh tốt — sẵn sàng phân tích';
    else if(score >= 60) advice = '🟡 Chất lượng khá — kết quả có thể chấp nhận';
    else if(score >= 40) advice = '🟠 Chất lượng trung bình — nên chụp lại';
    else advice = '🔴 Chất lượng kém — nên chụp lại với ánh sáng tốt hơn';

    return { score, issues, advice };
  }

  /**
   * Vẽ histogram lên canvas (helper cho UI)
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} hist {r,g,b}
   * @param {number} w
   * @param {number} h
   */
  function drawHistogram(ctx, hist, w, h){
    ctx.clearRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for(let i = 1; i < 4; i++){
      const y = h * i / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Tìm max để normalize
    let maxV = 0;
    for(let i = 0; i < 256; i++){
      maxV = Math.max(maxV, hist.r[i], hist.g[i], hist.b[i]);
    }
    if(maxV === 0) return;

    const channels = [
      { data: hist.r, color: 'rgba(239,68,68,0.75)' },
      { data: hist.g, color: 'rgba(16,185,129,0.75)' },
      { data: hist.b, color: 'rgba(59,130,246,0.75)' }
    ];
    const bw = w / 256;
    ctx.globalCompositeOperation = 'multiply';
    channels.forEach(function(ch){
      ctx.fillStyle = ch.color;
      for(let i = 0; i < 256; i++){
        const bh = (ch.data[i] / maxV) * h;
        ctx.fillRect(i * bw, h - bh, bw, bh);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }