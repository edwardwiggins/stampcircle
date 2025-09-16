import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';

function App() {
  return (
    <div>
      <FileUploaderRegular
         sourceList="local, camera, facebook, gdrive"
         classNameUploader="uc-light"
         pubkey="e1c55abdfeff3868c40a"
         onCommonUploadSuccess={(e) =>
           console.log(
             "Uploaded files URL list",
             e.detail.successEntries.map((entry) => entry.cdnUrl)
           )
         }
      />
    </div>
  );
}

export default App;