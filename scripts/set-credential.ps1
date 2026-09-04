param(
    [Parameter(Mandatory = $true)][ValidateLength(1, 256)][string]$Target,
    [Parameter(Mandatory = $true)][ValidateLength(1, 256)][string]$Username
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
namespace ReadonlyPop3Mcp {
    public static class CredentialWriter {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL {
            public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
            public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
        }
        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
        public static void Write(string target, string username, string secret) {
            byte[] bytes = Encoding.Unicode.GetBytes(secret);
            IntPtr blob = Marshal.AllocCoTaskMem(bytes.Length);
            try {
                Marshal.Copy(bytes, 0, blob, bytes.Length);
                CREDENTIAL credential = new CREDENTIAL {
                    Type = 1, TargetName = target, CredentialBlobSize = (UInt32)bytes.Length,
                    CredentialBlob = blob, Persist = 2, UserName = username
                };
                if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
            } finally {
                Array.Clear(bytes, 0, bytes.Length);
                if (blob != IntPtr.Zero) {
                    for (int i = 0; i < secret.Length; i++) Marshal.WriteInt16(blob, i * 2, 0);
                    Marshal.FreeCoTaskMem(blob);
                }
            }
        }
    }
}
'@
$securePassword = Read-Host 'POP3 password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    [ReadonlyPop3Mcp.CredentialWriter]::Write($Target, $Username, $plainPassword)
    Write-Host "Credential '$Target' saved in Windows Credential Manager."
} finally {
    $plainPassword = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}


