/**
 * Player abstraction. Screens depend on `VideoSurfaceProps` only; this file is the single place
 * that knows about react-native-video, so the provider can be swapped (e.g. back to a commercial SDK).
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Video, { ISO639_1, OnLoadData, OnProgressData, ResizeMode, SelectedTrackType, SelectedVideoTrackType, TextTrackType, VideoRef, ViewType } from 'react-native-video';
import type { Quality } from './logic';

export interface VideoSurfaceProps {
  uri: string;
  /** Seconds to start from (resume). */
  startPosition?: number;
  paused: boolean;
  rate: number;
  quality: Quality;
  fill: 'cover' | 'contain';
  /** WebVTT tracks from the playback API and the language to show (null = off). */
  subtitles?: { language: string; label: string; url: string }[];
  subtitleLanguage?: string | null;
  onReady?: (info: { duration: number; width: number; height: number }) => void;
  onProgress?: (position: number, duration: number) => void;
  onBuffering?: (buffering: boolean) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  testID?: string;
}

export interface VideoSurfaceHandle {
  seek: (seconds: number) => void;
}

export const VideoSurface = forwardRef<VideoSurfaceHandle, VideoSurfaceProps>(function VideoSurface(props, ref) {
  const video = useRef<VideoRef>(null);
  useImperativeHandle(ref, () => ({ seek: (s) => video.current?.seek(s) }), []);

  return (
    <Video
      ref={video}
      testID={props.testID}
      style={StyleSheet.absoluteFill}
      source={{
        uri: props.uri,
        type: 'm3u8',
        startPosition: props.startPosition ? Math.floor(props.startPosition * 1000) : undefined,
        bufferConfig: {
          // Short-drama clips: start fast, keep memory modest across up to three mounted players.
          minBufferMs: 8_000,
          maxBufferMs: 30_000,
          bufferForPlaybackMs: 1_000,
          bufferForPlaybackAfterRebufferMs: 2_000,
        },
        minLoadRetryCount: 3,
        textTracks: (props.subtitles ?? []).map((s) => ({ title: s.label, language: s.language as ISO639_1, type: TextTrackType.VTT, uri: s.url })),
      }}
      selectedTextTrack={
        props.subtitleLanguage ? { type: SelectedTrackType.LANGUAGE, value: props.subtitleLanguage } : { type: SelectedTrackType.DISABLED }
      }
      subtitleStyle={{ fontSize: 16, paddingBottom: 60, opacity: 0.95 }}
      paused={props.paused}
      rate={props.rate}
      repeat={false}
      resizeMode={props.fill === 'cover' ? ResizeMode.COVER : ResizeMode.CONTAIN}
      selectedVideoTrack={
        props.quality === 'auto'
          ? { type: SelectedVideoTrackType.AUTO }
          : { type: SelectedVideoTrackType.RESOLUTION, value: props.quality }
      }
      viewType={ViewType.SURFACE}
      shutterColor="transparent"
      hideShutterView
      playInBackground={false}
      playWhenInactive={false}
      preventsDisplaySleepDuringVideoPlayback={!props.paused}
      progressUpdateInterval={1000}
      onLoad={(e: OnLoadData) => props.onReady?.({ duration: e.duration, width: e.naturalSize.width, height: e.naturalSize.height })}
      onProgress={(e: OnProgressData) => props.onProgress?.(e.currentTime, e.seekableDuration || e.playableDuration)}
      onBuffer={(e) => props.onBuffering?.(e.isBuffering)}
      onEnd={props.onEnd}
      onError={(e) => props.onError?.(e.error?.errorString ?? e.error?.localizedDescription ?? 'Playback error')}
    />
  );
});
