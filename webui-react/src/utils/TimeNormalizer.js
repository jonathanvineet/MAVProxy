/**
 * TimeNormalizer: Single source of truth for all timestamp handling
 * 
 * Detects time scale automatically from data, normalizes to seconds,
 * and converts to relative time (0-based from start).
 * 
 * NEVER use raw timestamps or per-component scaling again.
 */
class TimeNormalizer {
  constructor(rawTimestamps, componentName = 'TimeNormalizer') {
    this.componentName = componentName
    this.rawTimestamps = rawTimestamps
    
    if (!rawTimestamps || rawTimestamps.length < 2) {
      console.warn(`[${this.componentName}] Empty timestamps, using scale=1`)
      this.scale = 1
      this.rawMin = 0
      this.absMin = 0
      return
    }

    // Store raw min BEFORE any processing
    this.rawMin = Math.min(...rawTimestamps)

    // Detect scale from differences
    const diffs = []
    for (let i = 1; i < Math.min(5, rawTimestamps.length); i++) {
      const diff = Math.abs(rawTimestamps[i] - rawTimestamps[i - 1])
      if (diff > 0) diffs.push(diff)
    }

    const medianDiff = diffs.length > 0 
      ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)]
      : 0

    // Heuristic: detect scale from median difference
    if (medianDiff > 100000) {
      this.scale = 1000000
      this.unit = 'microseconds'
    } else if (medianDiff > 1000) {
      this.scale = 1000
      this.unit = 'milliseconds'
    } else if (medianDiff > 10) {
      this.scale = 100
      this.unit = 'centiseconds'
    } else {
      this.scale = 1
      this.unit = 'seconds'
    }

    // Calculate absolute min (in seconds)
    this.absMin = this.rawMin / this.scale

    console.log(`[${this.componentName}] TIME NORMALIZER INITIALIZED`)
    console.log(`  Raw min: ${this.rawMin}`)
    console.log(`  Detected unit: ${this.unit}`)
    console.log(`  Scale factor: ${this.scale}`)
    console.log(`  Absolute min (seconds): ${this.absMin}`)
    console.log(`  Sample diffs: ${diffs.slice(0, 5)}`)
    console.log(`  Median diff: ${medianDiff}`)
  }

  /**
   * Convert raw timestamp to normalized seconds (absolute from epoch)
   * @param {number} rawTimestamp - Raw timestamp value
   * @returns {number} Normalized timestamp in seconds
   */
  toAbsolute(rawTimestamp) {
    return rawTimestamp / this.scale
  }

  /**
   * Convert raw timestamp to relative time (0-based from data start)
   * @param {number} rawTimestamp - Raw timestamp value
   * @returns {number} Relative time in seconds
   */
  toRelative(rawTimestamp) {
    return (rawTimestamp / this.scale) - this.absMin
  }

  /**
   * Batch convert array of raw timestamps to relative
   * @param {number[]} rawTimestamps - Array of raw timestamps
   * @returns {number[]} Array of relative timestamps
   */
  toRelativeArray(rawTimestamps) {
    return rawTimestamps.map(t => this.toRelative(t))
  }

  /**
   * Get data range in relative time
   * @returns {object} {min, max, span}
   */
  getRelativeRange() {
    const absMax = Math.max(...this.rawTimestamps.map(t => t / this.scale))
    return {
      min: 0,
      max: absMax - this.absMin,
      span: absMax - this.absMin
    }
  }

  /**
   * CRITICAL: Detect if timestamps are ALREADY scaled (pre-normalized)
   * This catches the GraphView bug where data is pre-scaled but flight modes aren't
   * @returns {boolean}
   */
  detectPreScaled() {
    const maxRaw = Math.max(...this.rawTimestamps)
    
    // If max is small relative to typical Unix timestamp, it's probably pre-scaled
    // Unix timestamps are ~1.7e9 (year 2024)
    // Pre-scaled: ~1.7e3 to 1.7e6 (hours to days in seconds)
    if (maxRaw < 1e7 && maxRaw > 100) {
      console.warn(`[${this.componentName}] ⚠️ DETECTED: Timestamps appear to be PRE-SCALED`)
      console.warn(`  Max raw: ${maxRaw} (should be ~1.7e9 for Unix timestamps)`)
      console.warn(`  These may be hours/days, not raw Unix timestamps`)
      return true
    }
    return false
  }

  /**
   * CRITICAL: Mismatch detection helper
   * Compare this normalizer's scale with another's
   * @param {TimeNormalizer} other - Another TimeNormalizer instance
   * @returns {object} Mismatch info {hasMismatch, ratio, recommendation}
   */
  detectMismatch(other) {
    const ratio = other.rawMin / this.rawMin
    const hasMismatch = Math.abs(ratio - 1) > 0.01 && (ratio < 0.001 || ratio > 1000)

    return {
      hasMismatch,
      ratio,
      thisUnit: this.unit,
      otherUnit: other.unit,
      thisMin: this.rawMin,
      otherMin: other.rawMin,
      recommendation: hasMismatch 
        ? `Mismatch detected: ${this.rawMin.toE2} vs ${other.rawMin.toE2}`
        : 'No mismatch'
    }
  }

  /**
   * Rescale timestamps from another scale to this one
   * Useful for converting flight modes to match data scale
   * @param {number} rawTimestamp - Timestamp in different scale
   * @param {number} otherScale - The other scale factor
   * @returns {number} Rescaled timestamp
   */
  rescaleFrom(rawTimestamp, otherScale) {
    // Convert to absolute seconds using other scale
    const absSeconds = rawTimestamp / otherScale
    // Convert back to our scale
    return absSeconds * this.scale
  }

  /**
   * Debug: Show normalized values for inspection
   * @param {number[]} rawTimestamps - Timestamps to inspect
   * @param {number} limit - Max to show
   */
  debug(rawTimestamps, limit = 5) {
    console.log(`[${this.componentName}] DEBUG: Sample normalization`)
    rawTimestamps.slice(0, limit).forEach((raw, i) => {
      const abs = this.toAbsolute(raw)
      const rel = this.toRelative(raw)
      console.log(`  [${i}] raw: ${raw} → abs: ${abs.toFixed(2)}s → rel: ${rel.toFixed(2)}s`)
    })
  }
}

export default TimeNormalizer
