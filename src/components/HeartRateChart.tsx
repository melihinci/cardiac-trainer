import { useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import type { HeartRateSample } from "../types/recording";

type HeartRateChartProps = {
  height?: number;
  maxBpm?: number;
  minBpm?: number;
  samples: HeartRateSample[];
  widthPerSample?: number;
};

const LEFT_AXIS_WIDTH = 42;
const RIGHT_PADDING = 18;
const TOP_PADDING = 16;
const BOTTOM_AXIS_HEIGHT = 28;
const MIN_CHART_WIDTH = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTimeSeconds(sample: HeartRateSample, firstTimestamp: number): number {
  return Math.max(0, Math.round((sample.timestamp - firstTimestamp) / 1000));
}

export function HeartRateChart({
  height = 180,
  maxBpm,
  minBpm,
  samples,
  widthPerSample = 18
}: HeartRateChartProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const chartHeight = Math.max(120, height);
  const plotHeight = chartHeight - TOP_PADDING - BOTTOM_AXIS_HEIGHT;
  const chartWidth = Math.max(MIN_CHART_WIDTH, LEFT_AXIS_WIDTH + RIGHT_PADDING + samples.length * widthPerSample);

  const chartData = useMemo(() => {
    if (samples.length === 0) {
      const fallbackMin = minBpm ?? 40;
      const fallbackMax = maxBpm ?? 200;

      return {
        max: fallbackMax,
        min: fallbackMin,
        path: "",
        points: [] as Array<{ bpm: number; x: number; y: number; seconds: number }>
      };
    }

    const bpms = samples.map((sample) => sample.bpm);
    const rawMin = minBpm ?? Math.min(...bpms);
    const rawMax = maxBpm ?? Math.max(...bpms);
    const min = Math.max(0, Math.floor(rawMin - 5));
    const max = Math.max(min + 1, Math.ceil(rawMax + 5));
    const firstTimestamp = samples[0]?.timestamp ?? Date.now();
    const denominator = max - min;
    const points = samples.map((sample, index) => {
      const x = LEFT_AXIS_WIDTH + index * widthPerSample;
      const normalized = (sample.bpm - min) / denominator;
      const y = TOP_PADDING + (1 - clamp(normalized, 0, 1)) * plotHeight;

      return {
        bpm: sample.bpm,
        seconds: getTimeSeconds(sample, firstTimestamp),
        x,
        y
      };
    });
    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return {
      max,
      min,
      path,
      points
    };
  }, [maxBpm, minBpm, plotHeight, samples, widthPerSample]);

  useEffect(() => {
    if (samples.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [samples.length]);

  if (samples.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height: chartHeight }]}>
        <Text style={styles.emptyText}>No samples yet</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      ref={scrollRef}
      showsHorizontalScrollIndicator
      style={styles.scroll}
    >
      <Svg height={chartHeight} width={chartWidth}>
        <Line
          stroke="#d9e1ee"
          strokeWidth={1}
          x1={LEFT_AXIS_WIDTH}
          x2={chartWidth - RIGHT_PADDING}
          y1={TOP_PADDING}
          y2={TOP_PADDING}
        />
        <Line
          stroke="#d9e1ee"
          strokeWidth={1}
          x1={LEFT_AXIS_WIDTH}
          x2={chartWidth - RIGHT_PADDING}
          y1={TOP_PADDING + plotHeight / 2}
          y2={TOP_PADDING + plotHeight / 2}
        />
        <Line
          stroke="#d9e1ee"
          strokeWidth={1}
          x1={LEFT_AXIS_WIDTH}
          x2={chartWidth - RIGHT_PADDING}
          y1={TOP_PADDING + plotHeight}
          y2={TOP_PADDING + plotHeight}
        />
        <Line
          stroke="#9aa8bd"
          strokeWidth={1}
          x1={LEFT_AXIS_WIDTH}
          x2={LEFT_AXIS_WIDTH}
          y1={TOP_PADDING}
          y2={TOP_PADDING + plotHeight}
        />
        <Line
          stroke="#9aa8bd"
          strokeWidth={1}
          x1={LEFT_AXIS_WIDTH}
          x2={chartWidth - RIGHT_PADDING}
          y1={TOP_PADDING + plotHeight}
          y2={TOP_PADDING + plotHeight}
        />

        <SvgText fill="#596579" fontSize={11} x={8} y={TOP_PADDING + 4}>
          {chartData.max}
        </SvgText>
        <SvgText fill="#596579" fontSize={11} x={8} y={TOP_PADDING + plotHeight + 4}>
          {chartData.min}
        </SvgText>
        <SvgText fill="#596579" fontSize={11} x={LEFT_AXIS_WIDTH + 4} y={chartHeight - 8}>
          0s
        </SvgText>

        {chartData.points.map((point, index) => {
          if (index % Math.max(1, Math.round(60 / widthPerSample)) !== 0 && index !== chartData.points.length - 1) {
            return null;
          }

          return (
            <SvgText
              fill="#596579"
              fontSize={10}
              key={`${point.x}-${point.seconds}`}
              textAnchor="middle"
              x={point.x}
              y={chartHeight - 8}
            >
              {point.seconds}s
            </SvgText>
          );
        })}

        {chartData.path ? (
          <Path d={chartData.path} fill="none" stroke="#1f6feb" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
        ) : null}

        {chartData.points.map((point, index) => (
          <Circle cx={point.x} cy={point.y} fill="#1f6feb" key={`${point.x}-${index}`} r={3} />
        ))}
      </Svg>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: "center",
    borderColor: "#d9e1ee",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    width: "100%"
  },
  emptyText: {
    color: "#657188",
    fontSize: 14,
    letterSpacing: 0
  },
  scroll: {
    width: "100%"
  }
});
