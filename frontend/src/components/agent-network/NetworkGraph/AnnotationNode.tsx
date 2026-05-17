import { memo } from 'react';
 
function AnnotationNode({ data }) {
  return (
    <>
      <div className='annotation-content'>
        <div>{data.label}</div>
      </div>
      {data.arrowStyle && (
        <div className="annotation-arrow" style={data.arrowStyle}>
          ⤹
        </div>
      )}
    </>
  );
}
 
export default memo(AnnotationNode);