import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma data aplicando o fuso horário configurado
 * @param date A data para formatar (pode ser Date, string, número, ou timestamp do Firebase)
 * @param timezone O fuso horário (ex: 'Africa/Maputo')
 * @param options Opções adicionais de formato para Intl.DateTimeFormat
 */
export function formatInTimezone(
  date: any,
  timezone: string = 'Africa/Maputo',
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  if (!date) return '-';
  
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'object' && date && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (typeof date === 'object' && date && date.seconds !== undefined) {
    d = new Date(date.seconds * 1000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return '-';

  try {
    return new Intl.DateTimeFormat('pt-PT', {
      ...options,
      timeZone: timezone,
    }).format(d);
  } catch (e) {
    console.error(`Erro ao formatar data no fuso ${timezone}:`, e);
    // Fallback sem fuso horário
    try {
      return d.toLocaleDateString('pt-PT', options);
    } catch {
      return d.toLocaleString();
    }
  }
}

export function formatDateInTimezone(date: any, timezone: string = 'Africa/Maputo'): string {
  return formatInTimezone(date, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTimeInTimezone(date: any, timezone: string = 'Africa/Maputo'): string {
  return formatInTimezone(date, timezone, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function getBrandTints(hex: string) {
  const cleanHex = hex.startsWith('#') ? hex : `#${hex}`;
  
  const hexToRgb = (h: string) => {
    // If shorthand hex like #333
    let value = h.slice(1);
    if (value.length === 3) {
      value = value.split('').map(char => char + char).join('');
    }
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  };

  const rgb = hexToRgb(cleanHex) || { r: 37, g: 99, b: 235 };

  // Calculate high quality hover color (reduce each channel by 15%)
  const darken = (val: number) => Math.max(0, Math.floor(val * 0.85));
  const hoverHex = `#${darken(rgb.r).toString(16).padStart(2, '0')}${darken(rgb.g).toString(16).padStart(2, '0')}${darken(rgb.b).toString(16).padStart(2, '0')}`;

  // Calculate dynamic subtle light tint background color (mix with 92% white)
  const l = (val: number) => Math.min(255, Math.floor(val + (255 - val) * 0.92));
  const lightHex = `#${l(rgb.r).toString(16).padStart(2, '0')}${l(rgb.g).toString(16).padStart(2, '0')}${l(rgb.b).toString(16).padStart(2, '0')}`;

  // Glow shadow string
  const glowStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;

  return {
    primary: cleanHex,
    hover: hoverHex,
    light: lightHex,
    glow: glowStr
  };
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("localStorage.getItem blocked/failed for key:", key, e);
    }
    return null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("localStorage.setItem blocked/failed for key:", key, e);
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("localStorage.removeItem blocked/failed for key:", key, e);
    }
  }
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn("sessionStorage.getItem blocked/failed for key:", key, e);
    }
    return null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("sessionStorage.setItem blocked/failed for key:", key, e);
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("sessionStorage.removeItem blocked/failed for key:", key, e);
    }
  }
};

/**
 * Converte um valor numérico em metros, ou meticais por extenso em português.
 * Ideal para faturas de alto padrão inspiradas no padrão Vyapar.
 */
export function convertNumberToWordsPt(amount: number): string {
  if (amount === 0) return 'Zero Meticais';
  
  const units = ['', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove'];
  const teens = ['Dez', 'Onze', 'Doze', 'Treze', 'Catorze', 'Quinze', 'Dezasseis', 'Dezassete', 'Dezoito', 'Dezanove'];
  const tens = ['', 'Dez', 'Vinte', 'Trinta', 'Quarenta', 'Cinquenta', 'Sessenta', 'Setenta', 'Oitenta', 'Noventa'];
  const hundreds = ['', 'Cento', 'Duzentos', 'Trezentos', 'Quatrocentos', 'Quinhentos', 'Seiscentos', 'Setecentos', 'Oitocentos', 'Novecentos'];

  function getUnder1000(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'Cem';
    
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const r1 = n % 100;
    const t = Math.floor(r1 / 10);
    const u = r1 % 10;
    
    if (h > 0) {
      parts.push(hundreds[h]);
    }
    
    if (r1 > 0) {
      if (h > 0) parts.push('e');
      if (r1 >= 10 && r1 < 20) {
        parts.push(teens[r1 - 10]);
      } else {
        if (t > 0) {
          parts.push(tens[t]);
          if (u > 0) {
            parts.push('e');
            parts.push(units[u]);
          }
        } else if (u > 0) {
          parts.push(units[u]);
        }
      }
    }
    return parts.join(' ');
  }

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let words = '';
  if (integerPart > 0) {
    const millions = Math.floor(integerPart / 1000000);
    const thousands = Math.floor((integerPart % 1000000) / 1000);
    const remainder = integerPart % 1000;

    const parts: string[] = [];

    if (millions > 0) {
      if (millions === 1) {
        parts.push('Um Milhão');
      } else {
        parts.push(getUnder1000(millions) + ' Milhões');
      }
    }

    if (thousands > 0) {
      if (thousands === 1) {
        parts.push('Mil');
      } else {
        parts.push(getUnder1000(thousands) + ' Mil');
      }
    }

    if (remainder > 0) {
      if (thousands > 0 && (remainder < 100 || remainder % 100 === 0)) {
        parts.push('e');
      }
      parts.push(getUnder1000(remainder));
    }

    const valueStr = parts.join(' ').trim();
    words = valueStr + (integerPart === 1 ? ' Metical' : ' Meticais');
  }

  if (decimalPart > 0) {
    const centsWords = getUnder1005(decimalPart) + (decimalPart === 1 ? ' Centavo' : ' Centavos');
    if (integerPart > 0) {
      words += ' e ' + centsWords;
    } else {
      words = centsWords;
    }
  } else if (integerPart > 0) {
    words += ' e Zero Centavos';
  }

  return words;
}

// Pequeno auxiliar interno para decimas de centavos
function getUnder1005(n: number): string {
  const units = ['', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove'];
  const teens = ['Dez', 'Onze', 'Doze', 'Treze', 'Catorze', 'Quinze', 'Dezasseis', 'Dezassete', 'Dezoito', 'Dezanove'];
  const tens = ['', 'Dez', 'Vinte', 'Trinta', 'Quarenta', 'Cinquenta', 'Sessenta', 'Setenta', 'Oitenta', 'Noventa'];
  if (n === 0) return '';
  if (n >= 10 && n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t > 0) {
    if (u > 0) return tens[t] + ' e ' + units[u];
    return tens[t];
  }
  return units[u];
}

export interface CompressionResult {
  blob: Blob;
  mimeType: string;
  beforeSizeKB: number;
  afterSizeKB: number;
  width: number;
  height: number;
}

/**
 * Utility to compress and resize a logo or branding image to keep it within safe sizes (under maxSizeBytes)
 * while preserving aspect ratio, using an iterative canvas quality-reduction loop.
 * Preserves transparency for PNG/WebP/GIF and only falls back to JPEG if size constraint requires it.
 */
export function compressLogoImage(
  file: File | Blob,
  maxSizeBytes: number = 700 * 1024, // 700KB max size
  maxDimension: number = 512 // 512x512px max dimensions
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const beforeSizeKB = Math.round(file.size / 1024);
    const fileName = (file as any).name || 'BlobFile';
    console.log(`[Compress] Starting compression for: ${fileName}, size: ${beforeSizeKB} KB, type: ${file.type}, targetMaxSize: ${Math.round(maxSizeBytes / 1024)} KB, maxDimension: ${maxDimension}`);
    
    if (file.type === 'image/svg+xml') {
      console.log(`[Compress] Detected SVG format. Skipping compression and resolving original image.`);
      resolve({
        blob: file,
        mimeType: file.type,
        beforeSizeKB,
        afterSizeKB: beforeSizeKB,
        width: 120,
        height: 120
      });
      return;
    }

    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      URL.revokeObjectURL(imgUrl);
      console.log(`[Compress] Image loaded successfully. Dimensions: ${img.width}x${img.height}`);
      
      try {
        let width = img.width;
        let height = img.height;
        
        // Calculate initial dimensions maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        console.log(`[Compress] Target dimension after scale calculation: ${width}x${height}`);
        
        // Check if original type supports transparency
        const isTransparentType = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
        
        const getCanvasBlob = (
          cvs: HTMLCanvasElement, 
          mime: string, 
          quality?: number
        ): Promise<Blob | null> => {
          return new Promise((res) => {
            let resolved = false;
            const timer = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.warn(`[Compress] toBlob operation TIMED OUT (1000ms limit reached) for mime: ${mime}, quality: ${quality}`);
                res(null);
              }
            }, 1000);

            try {
              cvs.toBlob((b) => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timer);
                  res(b);
                }
              }, mime, quality);
            } catch (err) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                console.error("[Compress] Exception thrown during cvs.toBlob:", err);
                res(null);
              }
            }
          });
        };

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error("Could not get 2D Canvas context.");
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const preferredMime = isTransparentType ? 'image/png' : 'image/jpeg';
        console.log(`[Compress] Attempting preferred output format: ${preferredMime}`);
        let currentBlob = await getCanvasBlob(canvas, preferredMime);
        
        if (currentBlob) {
          const currentSizeKB = Math.round(currentBlob.size / 1024);
          console.log(`[Compress] Base preferred render format size: ${currentSizeKB} KB vs target ${Math.round(maxSizeBytes / 1024)} KB`);
          if (currentBlob.size <= maxSizeBytes) {
            console.log(`[Compress] Success: Base processed image is within acceptable limits.`);
            resolve({
              blob: currentBlob,
              mimeType: preferredMime,
              beforeSizeKB,
              afterSizeKB: currentSizeKB,
              width,
              height
            });
            return;
          }
        }

        // If transparent, try scaling down in PNG internally to maintain transparency
        if (isTransparentType) {
          console.log(`[Compress] PNG with transparency exceeds maximum size. Iterating through scale factors to optimize...`);
          const scaleFactors = [0.85, 0.7, 0.5, 0.35];
          for (const factor of scaleFactors) {
            const scaledWidth = Math.round(width * factor);
            const scaledHeight = Math.round(height * factor);
            console.log(`[Compress] Scale factor iteration [${factor}] -> Target size: ${scaledWidth}x${scaledHeight}`);
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = scaledWidth;
            tempCanvas.height = scaledHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
              const pngBlob = await getCanvasBlob(tempCanvas, 'image/png');
              if (pngBlob) {
                const pngSizeKB = Math.round(pngBlob.size / 1024);
                console.log(`[Compress] Scale factor [${factor}] result: ${pngSizeKB} KB`);
                if (pngBlob.size <= maxSizeBytes) {
                  console.log(`[Compress] Success: Found transparent PNG optimization at factor ${factor} (${pngSizeKB} KB)`);
                  resolve({
                    blob: pngBlob,
                    mimeType: 'image/png',
                    beforeSizeKB,
                    afterSizeKB: pngSizeKB,
                    width: scaledWidth,
                    height: scaledHeight
                  });
                  return;
                }
              }
            }
          }
        }

        // Fall back to lossy JPEG compression (which will discard transparency and use white background)
        console.log(`[Compress] Proceeding with JPEG quality fallback reduction...`);
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = width;
        jpegCanvas.height = height;
        const jpegCtx = jpegCanvas.getContext('2d');
        if (!jpegCtx) {
          throw new Error("Could not get 2D Canvas context for JPEG compression.");
        }
        
        jpegCtx.fillStyle = "#FFFFFF";
        jpegCtx.fillRect(0, 0, width, height);
        jpegCtx.drawImage(img, 0, 0, width, height);

        const qualities = [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.3, 0.15];
        for (const q of qualities) {
          console.log(`[Compress] JPEG quality iteration - currentQuality: ${q}, dimensions: ${width}x${height}`);
          const jpegBlob = await getCanvasBlob(jpegCanvas, 'image/jpeg', q);
          if (jpegBlob) {
            const calculatedSizeInBytes = jpegBlob.size;
            console.log(`[Compress] JPEG iteration completed - currentQuality: ${q}, dimensions: ${width}x${height}, calculatedSizeInBytes: ${calculatedSizeInBytes} bytes (${Math.round(calculatedSizeInBytes / 1024)} KB)`);
            if (calculatedSizeInBytes <= maxSizeBytes) {
              console.log(`[Compress] Success: Found compatible JPEG quality at currentQuality: ${q}, dimensions: ${width}x${height}, final size: ${calculatedSizeInBytes} bytes (${Math.round(calculatedSizeInBytes / 1024)} KB)`);
              resolve({
                blob: jpegBlob,
                mimeType: 'image/jpeg',
                beforeSizeKB,
                afterSizeKB: Math.round(calculatedSizeInBytes / 1024),
                width,
                height
              });
              return;
            }
          }
        }

        // Extreme fallback - resize to very small dimensions under JPG
        console.log(`[Compress] Extreme fallback: Scale down to 50% and format as JPEG 0.5`);
        const miniWidth = Math.round(width * 0.5);
        const miniHeight = Math.round(height * 0.5);
        console.log(`[Compress] Extreme fallback dimensions: ${miniWidth}x${miniHeight}`);
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = miniWidth;
        fallbackCanvas.height = miniHeight;
        const fbCtx = fallbackCanvas.getContext('2d');
        if (fbCtx) {
          fbCtx.fillStyle = "#FFFFFF";
          fbCtx.fillRect(0, 0, miniWidth, miniHeight);
          fbCtx.drawImage(img, 0, 0, miniWidth, miniHeight);
          const finalBlob = await getCanvasBlob(fallbackCanvas, 'image/jpeg', 0.5);
          if (finalBlob) {
            const finalSizeKB = Math.round(finalBlob.size / 1024);
            console.log(`[Compress] Extreme fallback absolute result: ${finalSizeKB} KB`);
            resolve({
              blob: finalBlob,
              mimeType: 'image/jpeg',
              beforeSizeKB,
              afterSizeKB: finalSizeKB,
              width: miniWidth,
              height: miniHeight
            });
            return;
          }
        }

        if (currentBlob) {
          console.log(`[Compress] Warning: Could not reach target size limit. Resolving with best efforts preferredMime Blob of ${Math.round(currentBlob.size / 1024)} KB`);
          resolve({
            blob: currentBlob,
            mimeType: preferredMime,
            beforeSizeKB,
            afterSizeKB: Math.round(currentBlob.size / 1024),
            width,
            height
          });
        } else {
          console.error(`[Compress] Critical Failure: No output blob could be generated.`);
          reject(new Error("Falha ao gerar blob de compressão final."));
        }
      } catch (err) {
        console.error("[Compress] Unexpected error inside onload process:", err);
        reject(err);
      }
    };
    
    img.onerror = (evt) => {
      console.error("[Compress] Image load error source failed. Info:", evt);
      URL.revokeObjectURL(imgUrl);
      reject(new Error("Falha ao carregar a imagem para compressão."));
    };

    img.src = imgUrl;
  });
}

