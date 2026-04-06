export interface DataRecord {
  id: string;
  name: string;
  contentLength: number;
  userID: string;
  userName: string;
  editorID: string;
  editorName: string;
  year: number;
  summary: string;
  primaryDiscipline: string;
  secondaryDiscipline: string;
  keyWords: string;
  readability: number;
  taggingModel: string;
}

export interface LLMResult {
  summary: string;
  Subject1: string[];
  Subject2: string[];
  keywords: string[];
  readability: number;
}
