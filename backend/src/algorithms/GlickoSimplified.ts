import { Rating } from '../types';

export class GlickoSimplified {
  private static readonly MIN_RATING = 0;
  private static readonly MAX_RATING = 3000;
  private static readonly MIN_RD = 30;
  private static readonly MAX_RD = 350;
  private static readonly MIN_VOLATILITY = 0.03;
  private static readonly MAX_VOLATILITY = 1.2;
  private static readonly TAO = 0.5;

  static calculateNewRating(
    rating: number,
    rd: number,
    volatility: number,
    opponentRating: number,
    opponentRD: number,
    result: number
  ): Rating {
    const g = this.g(opponentRD);
    const E = this.E(rating, rd, opponentRating, opponentRD);

    const d2 = 1 / (Math.pow(g, 2) * E * (1 - E) + 0.0001);
    const newRating = rating + Math.pow(rd, 2) * g * (result - E) / (Math.pow(rd, 2) * Math.pow(g, 2) + d2);
    const newRD = Math.sqrt(1 / (1 / Math.pow(rd, 2) + 1 / d2));
    const newVolatility = this.calculateVolatility(result, E, volatility);

    return {
      rating: this.clamp(newRating, this.MIN_RATING, this.MAX_RATING),
      rd: this.clamp(newRD, this.MIN_RD, this.MAX_RD),
      volatility: this.clamp(newVolatility, this.MIN_VOLATILITY, this.MAX_VOLATILITY)
    };
  }

  static calculateMultipleMatches(
    currentRating: Rating,
    opponentRatings: { rating: number; rd: number }[],
    results: number[]
  ): Rating {
    let rating = currentRating.rating;
    let rd = currentRating.rd;
    let volatility = currentRating.volatility;

    for (let i = 0; i < opponentRatings.length; i++) {
      const updated = this.calculateNewRating(
        rating,
        rd,
        volatility,
        opponentRatings[i].rating,
        opponentRatings[i].rd,
        results[i]
      );
      rating = updated.rating;
      rd = updated.rd;
      volatility = updated.volatility;
    }

    return { rating, rd, volatility };
  }

  private static g(opponentRD: number): number {
    return 1 / Math.sqrt(1 + 3 * Math.pow(opponentRD / 173.7178, 2));
  }

  private static E(rating: number, rd: number, opponentRating: number, opponentRD: number): number {
    const g = this.g(opponentRD);
    const exponent = -g * (rating - opponentRating) / 400;
    return 1 / (1 + Math.pow(10, exponent));
  }

  private static calculateVolatility(result: number, E: number, currentVolatility: number): number {
    const deviation = Math.abs(result - E);
    let change = deviation * this.TAO * 0.1;

    if (deviation < 0.2) {
      change *= -1;
    } else if (deviation > 0.5) {
      change *= 1;
    } else {
      change *= 0;
    }

    return currentVolatility + change;
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}