import { readJSON, writeJSON } from "../client/storage";

export const lessonDone = (): boolean => readJSON<boolean>("skipbo-lesson", false);
export const markLessonDone = () => writeJSON("skipbo-lesson", true);
