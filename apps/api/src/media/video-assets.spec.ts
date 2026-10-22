import { AppException } from '../common/errors/app-exception';
import { MIN_UPLOAD_BYTES, validateUpload } from './video-assets.service';

const MAX = 2 * 1024 * 1024 * 1024;

describe('validateUpload', () => {
  it('maps accepted MIME types to extensions', () => {
    expect(validateUpload('video/mp4', 5_000_000, MAX)).toBe('mp4');
    expect(validateUpload('video/quicktime', 5_000_000, MAX)).toBe('mov');
  });

  it.each(['image/png', 'application/octet-stream', 'video/avi', 'text/html', ''])('rejects %p', (type) => {
    expect(() => validateUpload(type, 5_000_000, MAX)).toThrow(AppException);
  });

  it('enforces size bounds', () => {
    expect(() => validateUpload('video/mp4', MIN_UPLOAD_BYTES - 1, MAX)).toThrow(AppException);
    expect(() => validateUpload('video/mp4', MAX + 1, MAX)).toThrow(AppException);
    expect(() => validateUpload('video/mp4', 1.5, MAX)).toThrow(AppException);
    expect(validateUpload('video/mp4', MAX, MAX)).toBe('mp4');
  });
});
