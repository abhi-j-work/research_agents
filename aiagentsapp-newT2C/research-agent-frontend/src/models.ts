// src/models.ts
export interface Source {
  title: string;
  link: string;
  snippet: string;
}

export interface GraphDataPayload {
  html_content: string;
  download_url: string;
}