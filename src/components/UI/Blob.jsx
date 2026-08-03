import { BLOB_PATHS } from '../../utils/decorPaths';
import './Blob.css';

export default function Blob({ pathIndex = 0, opacityClass = 'o1', style }) {
  return (
    <svg
      className={`blob ${opacityClass}`}
      style={style}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={BLOB_PATHS[pathIndex % BLOB_PATHS.length]} />
    </svg>
  );
}
