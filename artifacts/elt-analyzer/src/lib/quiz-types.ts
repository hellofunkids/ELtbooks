export interface McqQuestion {
  type: "mcq";
  number: number;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
}

export interface ShortQuestion {
  type: "short";
  number: number;
  question: string;
  answer: string;
  sourceText?: string;
}

export interface UnscrambleQuestion {
  type: "unscramble";
  number: number;
  question: string;
  words: string[];
  answer: string;
}

export type QuizQuestion = McqQuestion | ShortQuestion | UnscrambleQuestion;

export interface QuizData {
  title: string;
  questions: QuizQuestion[];
}
