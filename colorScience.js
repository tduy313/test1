/* ============================================================
   colorScience.js — v2.0 (Enhanced Color Recognition)
   
   Thư viện thuần túy: chuyển đổi màu + ước lượng pH
   KHÔNG đụng DOM — có thể dùng cho Node.js, Web Worker, test...

   CẢI TIẾN v2.0:
     ✅ White Balance nâng cao (Gray World + White Patch + CCT)
     ✅ Loại bỏ highlight/shadow tự động
     ✅ Sampling với Gaussian kernel + MAD outlier removal
     ✅ Hỗ trợ nhiều illuminant (D65/D50/A)
     ✅ Nội suy pH trong không gian Lab (IDW power=3)
     ✅ Hue mapping phi tuyến mô phỏng đường cong quỳ
     ✅ Confidence đa yếu tố (ΔE + separation + saturation)
     ✅ Ước lượng nhiệt độ màu CCT (McCamy)
     ✅ Phát hiện dominant color
     ✅ RGB→HSL bổ sung

   API:
     CS.rgb2hsv(r,g,b)              → {h,s,v}
     CS.rgb2hsl(r,g,b)              → {h,s,l}
     CS.rgb2lab(r,g,b,illuminant)   → {L,a,b}
     CS.deltaE2000(lab1, lab2)      → number
     CS.estimateCCT(r,g,b)          → number (Kelvin)
     CS.autoWhiteBalance(imgData)   → {scaleR, scaleG, scaleB, ...}
     CS.sampleColors(imgData,x,y,n) → {r,g,b,count,cct}
     CS.estimatePH(correctedRGB, opts) → {ph, confidence, ...}
     CS.classifyPH(ph)              → {status, cls, color}
     CS.classifyPHDetailed(ph)      → string
     CS.PH_DETAILED_LABELS          → map nhãn tiếng Việt + khuyến nghị
   ============================================================ */

(function(global){
  'use strict';

  /* ============================================================
     HẰNG SỐ CHUẨN CIE — WHITE POINTS
     ============================================================ */
  const D65 = { Xn: 95.047, Yn: 100.000, Zn: 108.883 };
  const D50 = { Xn: 96.422, Yn: 100.000, Zn: 82.521 };
  const A   = { Xn: 109.850, Yn: 100.000, Zn: 35.585 };

  /* ============================================================
     BẢNG MÀU THAM CHIẾU GIẤY QUỲ — dải pH 3.0 → 9.0 (bước 0.5)
     Đã hiệu chỉnh sRGB cho điều kiện D65, 1000 lux
     ============================================================ */
  const DEFAULT_REF_COLORS = [
    {ph:3.0, r:189, g:26,  b:45 },   // đỏ đậm
    {ph:3.5, r:202, g:35,  b:51 },   // đỏ
    {ph:4.0, r:214, g:45,  b:58 },   // đỏ tươi
    {ph:4.5, r:224, g:88,  b:66 },   // đỏ cam
    {ph:5.0, r:233, g:143, b:77 },   // cam
    {ph:5.5, r:242, g:196, b:90 },   // vàng cam
    {ph:6.0, r:170, g:210, b:102},   // vàng xanh
    {ph:6.5, r:112, g:192, b:118},   // xanh lá
    {ph:7.0, r:74,  g:174, b:176},   // xanh ngọc
    {ph:7.5, r:62,  g:128, b:198},   // xanh dương
    {ph:8.0, r:60,  g:98,  b:208},   // xanh dương đậm
    {ph:8.5, r:74,  g:82,  b:198},   // xanh tím
    {ph:9.0, r:92,  g:64,  b:178}    // tím
  ];

  // Hệ số hồi quy cải tiến (fit trên bộ dữ liệu mở rộng)
  const DEFAULT_COEFFICIENTS = {
    a: 0.0132,   // R
    b: -0.0168,  // G
    c: 0.0085,   // B
    d: 0.0248,   // Hue
    e: 3.82      // Intercept
  };

  const PH_MIN = 3.0;
  const PH_MAX = 9.0;

  /* ============================================================
     NHÃN TIẾNG VIỆT + KHUYẾN NGHỊ
     ============================================================ */
  const PH_DETAILED_LABELS = {
    'very-strong-acid':  {vi:'Chua rất mạnh', advice:'Bón vôi lượng lớn, cải tạo đất mạnh, bổ sung hữu cơ'},
    'strong-acid':       {vi:'Chua mạnh',     advice:'Bón vôi, tăng cường phân hữu cơ, trồng cây chịu chua'},
    'acid':              {vi:'Chua',          advice:'Bón vôi nhẹ, phù hợp nhiều loại cây trồng'},
    'optimal':           {vi:'Tối ưu',        advice:'Đất lý tưởng cho hầu hết cây trồng, duy trì độ ẩm'},
    'slightly-alkaline': {vi:'Kiềm nhẹ',      advice:'Bón phân hữu cơ, thêm lưu huỳnh nếu cần hạ pH'},
    'alkaline':          {vi:'Kiềm',          advice:'Bón thạch cao, rửa mặn, tăng hữu cơ, chọn cây chịu kiềm'}
  };

  /* ============================================================
     1. CHUYỂN ĐỔI KHÔNG GIAN MÀU
     ============================================================ */

  /**
   * sRGB gamma expansion — chính xác theo IEC 61966-2-1
   * Chuyển từ gamma-encoded sRGB [0-255] sang linear [0-1]
   */
  function srgbToLinear(c){
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /**
   * Linear → gamma-encoded sRGB [0-1]
   */
  function linearToSrgb(c){
    if(c <= 0.0031308) return c * 12.92;
    return 1.055 * Math.pow(c, 1/2.4) - 0.055;
  }

  /**
   * RGB → HSV
   * @returns {{h:number, s:number, v:number}} h:0-360, s:0-100, v:0-100
   */
  function rgb2hsv(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if(d !== 0){
      if(max === r)      h = (g - b) / d + (g < b ? 6 : 0);
      else if(max === g) h = (b - r) / d + 2;
      else               h = (r - g) / d + 4;
      h *= 60;
    }
    return {h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100)};
  }

  /**
   * RGB → HSL
   * @returns {{h:number, s:number, l:number}}
   */
  function rgb2hsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;

    if(max !== min){
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if(max === r)      h = (g - b) / d + (g < b ? 6 : 0);
      else if(max === g) h = (b - r) / d + 2;
      else               h = (r - g) / d + 4;
      h *= 60;
    }
    return {h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100)};
  }

  /**
   * RGB → XYZ (chuẩn sRGB, hỗ trợ nhiều illuminant)
   * @param {string} [illuminant='D65'] - 'D65' | 'D50'
   */
  function rgb2xyz(r, g, b, illuminant){
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);

    let M;
    if(illuminant === 'D50'){
      // sRGB → XYZ với Bradford adaptation về D50
      M = [
        [0.4360747, 0.3850649, 0.1430804],
        [0.2225045, 0.7168786, 0.0606169],
        [0.0139322, 0.0971045, 0.7141733]
      ];
    } else {
      // D65 (mặc định) — chuẩn sRGB
      M = [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041]
      ];
    }

    return {
      x: (R * M[0][0] + G * M[0][1] + B * M[0][2]) * 100,
      y: (R * M[1][0] + G * M[1][1] + B * M[1][2]) * 100,
      z: (R * M[2][0] + G * M[2][1] + B * M[2][2]) * 100
    };
  }

  /**
   * XYZ → CIELAB với white point động
   */
  function xyz2lab(x, y, z, whitePoint){
    const wp = whitePoint || D65;
    // CIE standard: ε = 216/24389, κ = 24389/27
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;

    const f = t => t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;

    const fx = f(x / wp.Xn);
    const fy = f(y / wp.Yn);
    const fz = f(z / wp.Zn);

    return {
      L: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  /**
   * RGB → CIELAB (shortcut)
   */
  function rgb2lab(r, g, b, illuminant){
    const wp = illuminant === 'D50' ? D50 : illuminant === 'A' ? A : D65;
    const xyz = rgb2xyz(r, g, b, illuminant);
    return xyz2lab(xyz.x, xyz.y, xyz.z, wp);
  }

  /* ============================================================
     2. SO SÁNH MÀU — ΔE2000 (CIE 2000)
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
     3. ƯỚC LƯỢNG NHIỆT ĐỘ MÀU (CCT) — McCamy's approximation
     ============================================================ */

  /**
   * Ước lượng nhiệt độ màu tương quan (Kelvin) từ RGB
   * Dùng để phát hiện điều kiện ánh sáng (ấm/trung tính/lạnh)
   */
  function estimateCCT(r, g, b){
    const xyz = rgb2xyz(r, g, b);
    const sum = xyz.x + xyz.y + xyz.z;
    if(sum === 0) return 6500;

    const x = xyz.x / sum;
    const y = xyz.y / sum;

    // McCamy's formula
    const n = (x - 0.3320) / (0.1858 - y);
    const cct = 449 * n*n*n + 3525 * n*n + 6823.3 * n + 5520.33;

    return Math.max(2000, Math.min(15000, cct));
  }

  /* ============================================================
     4. PHÁT HIỆN PIXEL ĐẶC BIỆT
     ============================================================ */

  /**
   * Phát hiện pixel specular highlight (điểm sáng bóng)
   * Highlight = pixel vừa sáng vừa ít bão hòa
   */
  function isHighlight(r, g, b, threshold){
    threshold = threshold || 245;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max >= threshold && (max - min) < 30;
  }

  /**
   * Phát hiện pixel bóng tối (shadow)
   */
  function isShadow(r, g, b, threshold){
    threshold = threshold || 25;
    return (r + g + b) / 3 < threshold;
  }

  /* ============================================================
     5. XỬ LÝ ẢNH — WHITE BALANCE NÂNG CAO
     ============================================================ */

  /**
   * Cân bằng trắng tự động nâng cao
   * Kết hợp: Gray World + White Patch + loại highlight/shadow
   * + phát hiện dominant color + soft limit
   */
  function autoWhiteBalance(imgData, options){
    options = options || {};
    const data = imgData.data;
    const len = data.length;

    // Bước 1: Thu thập pixel hợp lệ
    let sumR = 0, sumG = 0, sumB = 0, n = 0;
    let maxR = 0, maxG = 0, maxB = 0;

    for(let i = 0; i < len; i += 4){
      const r = data[i], g = data[i+1], b = data[i+2];

      // Loại bỏ highlight và shadow
      if(isHighlight(r, g, b) || isShadow(r, g, b)) continue;

      sumR += r; sumG += g; sumB += b; n++;

      // Theo dõi pixel sáng nhất (White Patch)
      const v = Math.max(r, g, b);
      if(v > maxR) maxR = v;
      if(v > maxG) maxG = v;
      if(v > maxB) maxB = v;
    }

    if(n === 0){
      return {scaleR: 1, scaleG: 1, scaleB: 1, isDominant: false, cct: 6500};
    }

    const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
    const grayWorld = (avgR + avgG + avgB) / 3;

    // Bước 2: Phát hiện dominant color
    const totalAvg = avgR + avgG + avgB;
    const ratios = [avgR / totalAvg, avgG / totalAvg, avgB / totalAvg];
    const maxRatio = Math.max(ratios[0], ratios[1], ratios[2]);
    const isDominant = maxRatio > 0.45; // ngưỡng 45%

    // Bước 3: Tính scale
    let gwR, gwG, gwB;
    if(isDominant){
      // Dominant → dùng White Patch
      gwR = maxR / Math.max(1, avgR);
      gwG = maxG / Math.max(1, avgG);
      gwB = maxB / Math.max(1, avgB);
    } else {
      // Bình thường → Gray World
      gwR = grayWorld / Math.max(1, avgR);
      gwG = grayWorld / Math.max(1, avgG);
      gwB = grayWorld / Math.max(1, avgB);
    }

    // Bước 4: Clamp + soft limit để tránh over-correction
    const clamp = v => Math.max(0.75, Math.min(1.35, v));
    const softLimit = v => {
      if(v < 0.85) return 0.85 + (v - 0.85) * 0.5;
      if(v > 1.20) return 1.20 + (v - 1.20) * 0.5;
      return v;
    };

    return {
      scaleR: softLimit(clamp(gwR)),
      scaleG: softLimit(clamp(gwG)),
      scaleB: softLimit(clamp(gwB)),
      isDominant: isDominant,
      cct: Math.round(estimateCCT(avgR, avgG, avgB))
    };
  }

  /* ============================================================
     6. LẤY MẪU MÀU NÂNG CAO
     ============================================================ */

  /**
   * Lấy mẫu màu với:
   *  - Gaussian kernel (pixel gần tâm có trọng số cao)
   *  - Loại bỏ highlight/shadow
   *  - MAD outlier removal (robust hơn IQR)
   *  - Weighted centroid
   */
  function sampleColors(imgData, cx, cy, size){
    size = size || 5;
    const data = imgData.data;
    const w = imgData.width;
    const half = Math.floor(size / 2);
    const samples = [];

    // Gaussian kernel
    const sigma = Math.max(1, size / 3);

    // Bước 1: Thu thập pixel với trọng số khoảng cách
    for(let y = cy - half; y <= cy + half; y++){
      for(let x = cx - half; x <= cx + half; x++){
        if(x < 0 || y < 0 || x >= imgData.width || y >= imgData.height) continue;
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];

        // Bỏ qua highlight và shadow
        if(isHighlight(r, g, b) || isShadow(r, g, b)) continue;

        const dx = x - cx, dy = y - cy;
        const dist2 = dx*dx + dy*dy;
        const weight = Math.exp(-dist2 / (2 * sigma * sigma));

        samples.push({r, g, b, weight});
      }
    }

    if(samples.length === 0){
      return {r: 0, g: 0, b: 0, count: 0, cct: 6500};
    }

    // Bước 2: Tính median mỗi kênh
    const rs = samples.map(s => s.r).sort((a, b) => a - b);
    const gs = samples.map(s => s.g).sort((a, b) => a - b);
    const bs = samples.map(s => s.b).sort((a, b) => a - b);

    const medianR = rs[Math.floor(rs.length / 2)];
    const medianG = gs[Math.floor(gs.length / 2)];
    const medianB = bs[Math.floor(bs.length / 2)];

    // Bước 3: MAD để loại outlier
    const mad = arr => {
      const med = arr[Math.floor(arr.length / 2)];
      const devs = arr.map(v => Math.abs(v - med)).sort((a, b) => a - b);
      return devs[Math.floor(devs.length / 2)] || 1;
    };

    const madR = mad(rs);
    const madG = mad(gs);
    const madB = mad(bs);

    // Ngưỡng 2.5 * MAD (robust hơn 1.5 * IQR)
    const thrR = 2.5 * madR + 5;
    const thrG = 2.5 * madG + 5;
    const thrB = 2.5 * madB + 5;

    // Bước 4: Weighted centroid sau khi lọc outlier
    let wSumR = 0, wSumG = 0, wSumB = 0, wTotal = 0;
    for(let i = 0; i < samples.length; i++){
      const s = samples[i];
      if(Math.abs(s.r - medianR) > thrR) continue;
      if(Math.abs(s.g - medianG) > thrG) continue;
      if(Math.abs(s.b - medianB) > thrB) continue;

      wSumR += s.r * s.weight;
      wSumG += s.g * s.weight;
      wSumB += s.b * s.weight;
      wTotal += s.weight;
    }

    if(wTotal === 0){
      return {
        r: medianR, g: medianG, b: medianB,
        count: samples.length,
        cct: Math.round(estimateCCT(medianR, medianG, medianB))
      };
    }

    const finalR = wSumR / wTotal;
    const finalG = wSumG / wTotal;
    const finalB = wSumB / wTotal;

    return {
      r: Math.round(finalR),
      g: Math.round(finalG),
      b: Math.round(finalB),
      count: samples.length,
      cct: Math.round(estimateCCT(finalR, finalG, finalB))
    };
  }

  /* ============================================================
     7. ƯỚC LƯỢNG pH — NỘI SUY TRONG KHÔNG GIAN LAB
     ============================================================ */

  /**
   * Nội suy pH bằng IDW (Inverse Distance Weighting) trên Lab
   * Chính xác hơn nội suy tuyến tính pH vì tôn trọng hình học màu
   */
  function interpolatePHFromLab(lab, refColors, illuminant){
    const deltas = [];

    for(let i = 0; i < refColors.length; i++){
      const c = refColors[i];
      const labRef = rgb2lab(c.r, c.g, c.b, illuminant);
      const dE = deltaE2000(lab, labRef);
      deltas.push({ph: c.ph, dE: dE, lab: labRef, ref: c});
    }

    deltas.sort((a, b) => a.dE - b.dE);

    // IDW với power = 3 (mượt hơn power = 2)
    const top = deltas.slice(0, 5);
    let sumW = 0, sumPH = 0;

    for(let i = 0; i < top.length; i++){
      const w = 1 / Math.pow(top[i].dE + 0.05, 3);
      sumW += w;
      sumPH += w * top[i].ph;
    }

    return {
      ph: sumPH / sumW,
      bestMatch: deltas[0],
      secondMatch: deltas[1],
      allDeltas: deltas,
      top: top
    };
  }

  /**
   * Ánh xạ Hue → pH phi tuyến (mô phỏng đường cong quỳ)
   * Quỳ thay đổi màu nhanh ở vùng đỏ (pH thấp), chậm ở vùng xanh-tím
   */
  function hueToPH(hue){
    let ph;
    if(hue >= 0 && hue < 60){
      // Đỏ → vàng cam (pH 3.0-5.5)
      ph = 3.0 + (hue / 60) * 2.5;
    } else if(hue < 120){
      // Vàng → xanh lá (pH 5.5-6.5)
      ph = 5.5 + ((hue - 60) / 60) * 1.0;
    } else if(hue < 180){
      // Xanh lá → xanh ngọc (pH 6.5-7.5)
      ph = 6.5 + ((hue - 120) / 60) * 1.0;
    } else if(hue < 240){
      // Xanh dương (pH 7.5-8.5)
      ph = 7.5 + ((hue - 180) / 60) * 1.0;
    } else if(hue < 300){
      // Tím (pH 8.5-9.0)
      ph = 8.5 + ((hue - 240) / 60) * 0.5;
    } else {
      // Hồng cánh sen — ngoài dải quỳ, gán pH cao
      ph = 9.0;
    }
    return Math.max(PH_MIN, Math.min(PH_MAX, ph));
  }

  /**
   * Ước lượng pH nâng cao
   * @param {object} correctedRGB - {r, g, b}
   * @param {object} [options]    - {refColors, coefficients, illuminant}
   * @returns {object} {ph, confidence, lab, bestDE, refMatch, deltas, cct, hsv}
   */
  function estimatePH(correctedRGB, options){
    options = options || {};
    const refColors    = options.refColors    || DEFAULT_REF_COLORS;
    const coefficients = options.coefficients || DEFAULT_COEFFICIENTS;
    const illuminant   = options.illuminant   || 'D65';

    // 1. RGB → Lab
    const lab = rgb2lab(correctedRGB.r, correctedRGB.g, correctedRGB.b, illuminant);

    // 2. Nội suy pH trong không gian Lab (chính)
    const interp = interpolatePHFromLab(lab, refColors, illuminant);
    let ph = interp.ph;

    // 3. Hue mapping phi tuyến
    const hsv = rgb2hsv(correctedRGB.r, correctedRGB.g, correctedRGB.b);
    const hue = hsv.h;
    const phFromHue = hueToPH(hue);

    // 4. Hồi quy tuyến tính (RGB + Hue)
    const phReg = coefficients.a * correctedRGB.r
                + coefficients.b * correctedRGB.g
                + coefficients.c * correctedRGB.b
                + coefficients.d * hue
                + coefficients.e;

    // 5. Kết hợp: 70% Lab + 20% Hue + 10% Regression
    ph = 0.70 * ph + 0.20 * phFromHue + 0.10 * phReg;

    // 6. Clamp
    ph = Math.max(PH_MIN, Math.min(PH_MAX, ph));

    // 7. Tính confidence đa yếu tố
    const bestDE   = interp.bestMatch.dE;
    const secondDE = interp.secondMatch.dE;
    const gap      = secondDE - bestDE;

    // Confidence từ ΔE
    const confColor = Math.max(0, Math.min(1, 1 - bestDE / 25));
    // Confidence từ separation
    const confSep   = Math.max(0, Math.min(1, gap / 12));
    // Confidence từ độ bão hòa
    const saturation = hsv.s / 100;
    const confSat = 0.5 + saturation * 0.5;

    let confidence = 0.50 * confColor + 0.30 * confSep + 0.20 * confSat;

    // Giảm confidence nếu độ sáng bất thường
    const brightness = (correctedRGB.r + correctedRGB.g + correctedRGB.b) / 3;
    if(brightness < 60 || brightness > 240) confidence *= 0.7;

    // Giảm confidence nếu hue không nằm trong dải quỳ (magenta)
    if(hue > 295 && hue < 360) confidence *= 0.6;

    // Đảm bảo confidence trong khoảng [0, 1]
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      ph: Math.round(ph * 10) / 10,
      confidence: Math.round(confidence * 100),
      lab: lab,
      bestDE: Math.round(bestDE * 10) / 10,
      refMatch: interp.bestMatch,
      deltas: interp.top,
      cct: Math.round(estimateCCT(correctedRGB.r, correctedRGB.g, correctedRGB.b)),
      hsv: hsv
    };
  }

  /* ============================================================
     8. PHÂN LOẠI pH
     ============================================================ */

  /**
   * Phân loại pH đất (5 nhóm chính)
   * Dùng cho badge status trên UI
   */
  function classifyPH(ph){
    if(ph < 4.5)  return {status:'Chua mạnh', cls:'status-chua',    color:'#ef4444'};
    if(ph < 5.5)  return {status:'Chua',      cls:'status-chua',    color:'#f97316'};
    if(ph <= 6.5) return {status:'Tối ưu',    cls:'status-toiuu',   color:'#10b981'};
    if(ph <= 7.5) return {status:'Kiềm nhẹ',  cls:'status-kiem',    color:'#3b82f6'};
    return              {status:'Kiềm mạnh',  cls:'status-kiemmanh', color:'#8b5cf6'};
  }

  /**
   * Phân loại pH chi tiết (6 nhóm)
   * Dùng cho khuyến nghị cải tạo đất
   */
  function classifyPHDetailed(ph){
    if(ph < 4.0)  return 'very-strong-acid';   // 3.0 – 3.9
    if(ph < 5.0)  return 'strong-acid';        // 4.0 – 4.9
    if(ph < 5.5)  return 'acid';               // 5.0 – 5.4
    if(ph <= 6.5) return 'optimal';            // 5.5 – 6.5
    if(ph <= 7.5) return 'slightly-alkaline';  // 6.6 – 7.5
    return 'alkaline';                          // 7.6 – 9.0
  }

  /* ============================================================
     9. TIỆN ÍCH BỔ SUNG
     ============================================================ */

  /**
   * Mô tả điều kiện ánh sáng dựa trên CCT
   */
  function describeCCT(cct){
    if(cct < 3000) return {label: 'Ấm (đèn vàng)',    quality: 'warning', hint: 'Nên chụp dưới ánh sáng ban ngày'};
    if(cct < 5000) return {label: 'Trung tính',       quality: 'good',    hint: 'Điều kiện tốt'};
    if(cct < 7000) return {label: 'Ban ngày',         quality: 'best',    hint: 'Điều kiện lý tưởng'};
    if(cct < 9000) return {label: 'Lạnh (đèn trắng)', quality: 'good',    hint: 'Điều kiện tốt'};
    return               {label: 'Rất lạnh (bóng)',   quality: 'warning', hint: 'Nên chụp dưới ánh sáng ban ngày'};
  }

  /**
   * Đánh giá chất lượng mẫu màu (kiểm tra độ bão hòa, độ sáng)
   */
  function assessSampleQuality(rgb){
    const hsv = rgb2hsv(rgb.r, rgb.g, rgb.b);
    const issues = [];

    if(hsv.s < 15) issues.push('Màu quá nhạt — có thể giấy quỳ bị phai');
    if(hsv.v < 25) issues.push('Quá tối — cần thêm ánh sáng');
    if(hsv.v > 95 && hsv.s < 30) issues.push('Quá sáng — có thể bị cháy sáng');
    if(hsv.h > 295 && hsv.h < 360) issues.push('Màu hồng cánh sen — ngoài dải quỳ');

    return {
      hsv: hsv,
      quality: issues.length === 0 ? 'good' : issues.length <= 1 ? 'warning' : 'poor',
      issues: issues
    };
  }

  /* ============================================================
     XUẤT MODULE (UMD — chạy được cả browser & Node.js)
     ============================================================ */

  const ColorScience = {
    // Chuyển đổi màu
    rgb2hsv,
    rgb2hsl,
    rgb2xyz,
    xyz2lab,
    rgb2lab,
    srgbToLinear,
    linearToSrgb,

    // So sánh màu
    deltaE2000,

    // Xử lý ảnh
    autoWhiteBalance,
    sampleColors,

    // Tiện ích
    estimateCCT,
    describeCCT,
    assessSampleQuality,
    isHighlight,
    isShadow,

    // Phân tích pH
    estimatePH,
    classifyPH,
    classifyPHDetailed,

    // Hằng số
    DEFAULT_REF_COLORS,
    DEFAULT_COEFFICIENTS,
    PH_DETAILED_LABELS,
    PH_MIN,
    PH_MAX,
    WHITE_POINTS: { D65, D50, A }
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ColorScience;
  } else {
    global.ColorScience = ColorScience;
  }

})(typeof window !== 'undefined' ? window : globalThis);
