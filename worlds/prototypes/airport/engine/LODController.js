export class LODController {
  constructor({ distances = [20, 40, 65], hysteresis = 0.1, onChange = () => {} } = {}) {
    this.distances = distances;
    this.hysteresis = hysteresis;
    this.onChange = onChange;
    this.level = 0;
  }
  update(distance, scale = 1) {
    let level = this.level;
    while (level < this.distances.length && distance > this.distances[level] * scale * (1 + this.hysteresis)) level++;
    while (level > 0 && distance < this.distances[level - 1] * scale * (1 - this.hysteresis)) level--;
    if (level !== this.level) { this.level = level; this.onChange(level); }
    return level;
  }
}
