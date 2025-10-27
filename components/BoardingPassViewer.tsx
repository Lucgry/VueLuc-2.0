import React from 'react';

interface BoardingPassViewerProps {
  fileURL: string;
  fileType: string;
  onClose: () => void;
}

const BoardingPassViewer: React.FC<BoardingPassViewerProps> = ({ fileURL, fileType, onClose }) => {
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 backdrop-blur-sm flex justify-center items-center z-[100] p-4 w-screen h-screen" 
      onClick={onClose}
    >
      <button 
        onClick={(e) => {
          e.stopPropagation(); 
          onClose();
        }} 
        className="absolute top-4 right-4 text-white bg-black/50 rounded-full text-4xl leading-none w-12 h-12 flex items-center justify-center z-[101]"
        aria-label="Cerrar"
      >
        &times;
      </button>
      
      <div className="w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {fileType.startsWith('image/') ? (
          <img src={fileURL} alt="Tarjeta de Embarque" className="max-w-full max-h-full object-contain" />
        ) : fileType === 'application/pdf' ? (
          <object data={fileURL} type="application/pdf" className="w-full h-full">
            <div className="text-white text-center p-6 bg-slate-700 rounded-lg shadow-lg">
                <p className="text-xl font-bold mb-2">Error al mostrar PDF</p>
                <p className="mb-4">Tu navegador no pudo mostrar el PDF aquí.</p>
                <a 
                    href={fileURL} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-block px-4 py-2 bg-indigo-600 font-semibold rounded-md hover:bg-indigo-700 transition"
                >
                    Abrir en nueva pestaña
                </a>
            </div>
          </object>
        ) : (
          <div className="text-white text-center">
            <p className="text-2xl font-bold">Formato no soportado</p>
            <p>No se puede mostrar el archivo de tipo: {fileType}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardingPassViewer;